# Feature — Voice & Camera Product/Place Discovery (Agent → Apify MCP)

**Status:** Proposed · branch `feature/voice-product-discovery`
**Owners:** Dev 1 (AI Agent) · Dev 2 (Backend) · Dev 3 (Infra) · Dev 4 (Vision) · Dev 5 (Voice)
**Tech:** Amazon Transcribe · Bedrock Agent · **Apify MCP Server** · Qwen3-VL (vision) · Amazon Polly

---

## 1. Goal

A user — including a blind or low-vision user — can discover everything about a **product or place** in one of two hands-light ways:

1. **By voice only** — *"How is the Sony WH-1000XM5?"*, *"Tell me about Blue Bottle Coffee on Mint Plaza."*
2. **By camera** — the user gives a **voice command to take a picture** (*"Autnio, take a picture"*), points the phone at a product/storefront, and the captured frame is sent into the pipeline. Vision identifies *what it is*, and that identification **starts the same discovery pipeline** — no typing, no knowing the exact product name.

In both cases the **Bedrock Agent** decides what is being asked and **triggers Apify through an MCP server** to scrape live data. When the scrape finishes, Autnio **speaks** a short confirmation + a 3–4 sentence AI summary, and ends by inviting follow-up questions. The product/place context is held in the session so the user can then **ask anything about it by voice**.

> This is an **additive** feature. It reuses the existing voice pipeline (`DEV5_VOICE.md`), the existing vision pipeline (`functions/vision/*`, `web/src/vision/*`), and the existing Bedrock Agent loop (`functions/automation/chat.js`). The genuinely new pieces are: an **Apify MCP integration** for the agent, one **product discovery action**, and a small **vision → product-name** bridge.

### Demo scope & cost guardrails (implemented)

To keep the demo cheap and predictable, the discovery is deliberately lightweight:

- **Amazon products only.** No place/maps scraping. The query is an Amazon **search**, not an exact product match.
- **Vision gives a short phrase, not an exact identity.** Qwen3-VL returns an Amazon-searchable description of **at most 5 words** (e.g. *"blue american tourister laptop bag"*). The frontend and agent both truncate to 5 words.
- **First result only.** The Amazon search runs with `maxItems: 1` — only the top hit is scraped.
- **Last 6 months only (hard rule).** Reviews dated before a 6-month cutoff are dropped; review snippets are capped (default 3, max 5). This bounds how much data Apify pulls per run.

---

## 2. How it fits the current code

Everything below already exists today and is reused as-is:

| Concern | Existing code | Role in this feature |
|---|---|---|
| Voice in (STT) | `transcribe` Lambda (`DEV5_VOICE.md`), `web/src/voice/VoiceInput.ts` | Mic → text → `POST /chat` |
| Agent loop | `functions/automation/chat.js`, `agent/invoke-agent.js` | Invokes Bedrock Agent, streams reply, logs session to DynamoDB |
| Agent brain | `agent/instructions.txt`, `agent/bedrock-agent-config.json`, `agent/prompts/system-prompt.md` | Decides intent + which tool to call |
| Voice out (TTS) | `synthesize-speech.js` / `/voice/tts`, `web/src/voice/VoiceOutput.ts` (`speakText`) | Text → Polly MP3 → played in browser |
| Camera capture | `web/src/vision/CameraFeed.tsx`, `web/src/vision/visionApi.ts` (`uploadFrame`, `analyzeFrame`) | Grabs a frame, PUTs it to S3 via presigned URL |
| Frame upload | `functions/vision/upload-url.js` → presigned S3 PUT, key `frames/{userId}/{uuid}.jpg` | Stores the captured image |
| Vision inference | `functions/vision/router.py` → `qwen_detect.py` (Qwen3-VL) / `nemotron_stream.py` | Identifies the object/place in the frame |
| Apify (sync) | `functions/data/apify-research.js`, `apify-jobs.js`, `apify-run.js` | Existing scraping handlers |
| Apify (async) | `functions/automation/trigger-apify.js` + `check-apify-run.js` | Start-now / poll-later pattern for long scrapes |

**Net-new in this feature:** an Apify **MCP server** wired to the agent (today the codebase uses Apify via the SDK/REST only — there is no MCP yet), a `productDiscovery` action, and a vision→product bridge prompt.

---

## 3. End-to-end flows

### 3a. Voice-only flow

```
User speaks: "How good is the Dyson V15?"
        │
   transcribe Lambda → Amazon Transcribe → text
        │
   POST /chat  →  Bedrock Agent  (chat.js)
        │   agent recognizes a product/place discovery intent
        ▼
   Agent calls Apify via MCP server  (productDiscovery)
        │   Apify actor scrapes price, rating, reviews, availability / hours, location
        ▼
   Structured result returned to the agent
        │   agent writes a 3–4 sentence natural-language summary
        ▼
   /voice/tts → Amazon Polly → spoken answer in the browser
        │
   Session keeps the product context  →  user asks follow-ups by voice
```

### 3b. Camera flow (primary path for blind / low-vision users)

```
User speaks: "Autnio, take a picture"
        │   (voice command — recognized as a capture intent)
        ▼
Web app (CameraFeed.tsx) grabs ONE frame from the live camera
        │   uploadFrame() → POST /upload → presigned S3 PUT → imageS3Key
        ▼
Frame analyzed → POST /vision/image → router.py → Qwen3-VL (qwen_detect.py)
        │   Vision returns: "this is a <product/place> — <identifying details, brand, text on label, storefront name>"
        ▼
Identified name + details handed to the Bedrock Agent as the discovery query
        │   (agent treats it exactly like a spoken "tell me about <X>")
        ▼
Agent calls Apify via MCP  →  scrape  →  summarize   (same as 3a)
        ▼
Polly speaks the confirmation + summary + "you can now ask questions about it"
```

The camera path's **only** difference from the voice path is the front: instead of the product name coming from speech, it comes from **Qwen3-VL identifying the frame**. From the agent's perspective it is the same discovery request.

---

## 4. Spoken result format (required)

When the scrape completes, the agent composes a reply that the TTS layer speaks **in this exact shape**:

1. **Confirmation line** — *"I now have all the information about the product."* (for a place: *"…about the place."*)
2. **One paragraph, 3–4 sentences** — an AI-written summary: what it is, the headline verdict (rating / sentiment), price or hours/availability, and one standout pro and con (or for a place: vibe, what it's known for, and one caveat).
3. **Closing invite** — *"You can now ask questions about the product."*

Example spoken output:

> "I now have all the information about the Dyson V15 Detect. It's a top-rated cordless vacuum at about $649, averaging 4.6 stars across roughly 9,000 reviews, and people love its laser dust detection and strong suction. The most common complaints are the price and that the battery runs about 60 minutes on the lower setting. You can now ask questions about the product."

The agent's `system-prompt.md` gets a rule enforcing this structure and keeping it voice-friendly (no reading URLs aloud — offer to send/save the link instead).

---

## 5. What gets added (no code in this PR — spec only)

### 5.1 Apify MCP server wired to the Bedrock Agent  *(Dev 1 + Dev 3)*

- Connect an **Apify MCP server** so the agent can invoke Apify actors as MCP tools rather than through a bespoke Lambda. This is the integration the user asked for ("trigger the Apify through MCP").
- The MCP server exposes Apify actors (product/shopping scraper, Google Maps/place scraper) as callable tools; the agent selects the actor and passes the query.
- Auth: the existing `APIFY_API_TOKEN` / `APIFY_TOKEN` secret (already referenced in `functions/package.json`, `agent/functions/apify_scrape.py`, and the infra stacks) is supplied to the MCP server via SSM/secret, not hard-coded.
- Long scrapes reuse the established **async pattern** (`trigger-apify.js` start → `check-apify-run.js` poll) so the agent isn't blocked past its timeout; the spoken "looking that up…" filler covers the wait.

### 5.2 New agent action — `productDiscovery`  *(Dev 1 + Dev 2)*

A discovery action added to the `web-data` action group, modeled on `apify-research.js` / `apify-jobs.js` and returning the project's standard `{ result, data }` shape via `bedrockResponse(...)`.

Inputs:
- `query` (required) — product or place name (from speech, or from the vision identification).
- `kind` — `product` | `place` (default `product`).
- `maxReviews` — review snippets to include (default 3).

Output `data` (compact, voice-summarizable):

```json
{
  "kind": "product",
  "name": "Dyson V15 Detect",
  "price": "$649.00",
  "rating": 4.6,
  "reviewCount": 9000,
  "availability": "in stock",
  "pros": ["laser dust detection", "strong suction"],
  "cons": ["expensive", "~60 min battery"],
  "topReviews": [{ "rating": 5, "text": "…" }],
  "url": "https://…"
}
```

For `kind: place` the same envelope carries `hours`, `address`, `priceLevel`, `category`, and review highlights instead.

### 5.3 Schema entry — `agent/schemas/web-data.yaml`  *(Dev 1)*

Add a `/product-discovery` path (operationId `productDiscovery`) alongside the existing `apifyRun` / `apifyJobs` / `apifyResearch` paths, with the inputs above and the shared `SuccessResponse` schema.

### 5.4 Vision → product-name bridge  *(Dev 4)*

- Add a discovery-oriented prompt mode to the vision call (reusing `router.py` → `qwen_detect.py`): given a captured frame, return a concise **identification** — product brand/model and any label text, or a storefront/place name — suitable for use as the `productDiscovery` query.
- On the web side, `CameraFeed.tsx` / `visionApi.ts` already do `uploadFrame` → `analyzeFrame`; this feature adds a "**capture for discovery**" trigger that runs that flow once on the voice command and forwards the identification to `POST /chat`.

### 5.5 Voice capture command  *(Dev 5 + Dev 4)*

- Recognize a **"take a picture" / "what is this"** voice intent. On match, the web app captures a single frame (existing `CameraFeed` capture) instead of routing the utterance to the agent as text.
- Strong accessibility cues: an audible shutter + a short Polly line ("Got it, looking at that now…") so a blind user knows the photo was taken and the pipeline started.

### 5.6 Agent instruction updates  *(Dev 1)*

- `agent/instructions.txt` + `agent/prompts/system-prompt.md`: teach the agent to (a) route product/place questions to `productDiscovery` via the Apify MCP tools, (b) treat a vision identification as a discovery query, (c) speak results in the **Section 4** format, and (d) answer follow-ups from the session-held product context without re-scraping unless asked.

### 5.7 Infra wiring  *(Dev 3)*

- Register the `productDiscovery` Lambda (reuse the existing Apify Lambda role/layer and `APIFY_API_TOKEN`).
- Provision/host the **Apify MCP server** and grant the agent access to it; store the Apify token in SSM as the other secrets are.
- Add `APIFY_PRODUCT_ACTOR` / `APIFY_PLACE_ACTOR` env vars next to the existing `APIFY_JOBS_ACTOR`.

---

## 6. Follow-up Q&A (session memory)

After the summary, the product/place `data` lives in the agent session (same session id used by `chat.js` / `invoke-agent.js`, persisted to DynamoDB `autnio-main`). The user can then ask, by voice:

- *"Is it worth the price?"* / *"What do the bad reviews say?"*
- *"What are the hours on Sunday?"* (place)
- *"Compare it to the Bose."* (triggers a second `productDiscovery`)
- *"Send me the link"* (email via `sendEmail`) or *"Save this to my files"* (Box `boxUpload`) — existing tools, no new work.

The agent answers from the cached context and only re-scrapes when the user clearly asks for something new.

---

## 7. Accessibility notes (blind / low-vision)

- **No screen reading required**: every step has audio — shutter sound on capture, "looking that up…" filler during the scrape, the spoken summary, and the explicit "you can now ask questions" invite.
- **One-gesture capture**: the only physical action is pointing the camera; the trigger is a voice command.
- **Graceful failure by voice**: if vision can't identify the item or the scrape returns nothing, the agent says so and asks one clarifying question (consistent with `instructions.txt` rule #3) rather than failing silently.

---

## 8. Out of scope

- No changes to STT/TTS internals — voice I/O is reused.
- No new third-party accounts — uses the existing Apify token.
- No new front-end framework work beyond the capture trigger + audio cues.

---

## 9. Acceptance criteria

1. Saying *"How is \<product\>?"* yields a spoken summary in the Section 4 format (confirmation → 3–4 sentence paragraph → "you can now ask questions").
2. Saying *"take a picture"* captures one frame, Qwen3-VL identifies the item, and the same discovery + spoken summary runs end-to-end.
3. The agent reaches Apify **through the MCP server**, not a hard-coded path.
4. `productDiscovery` returns structured `data` for both `product` and `place`.
5. Follow-up voice questions are answered from session context without re-scraping unless the user asks for new info.
6. Every stage emits audio feedback; nothing requires sight to operate.
7. Existing voice, vision, and research flows are unchanged (purely additive).
```

