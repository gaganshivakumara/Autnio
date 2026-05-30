# Autnio

**Your AI companion for the digital and physical world.**

Autnio is a unified AI platform that combines computer automation, remote access, and real-world assistance into a single intelligent system. Powered by AWS infrastructure and best-in-class third-party services, Autnio acts as a personal AI agent that understands both your digital environment and the physical world — and takes meaningful action on your behalf.

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| AI Agent Orchestration | [Amazon Bedrock Agents](https://aws.amazon.com/bedrock/agents/) | Multi-step reasoning, tool use, and autonomous task execution |
| Serverless Compute | [AWS Lambda](https://aws.amazon.com/lambda/) | Event-driven backend functions powering every action |
| User Database | [Amazon DynamoDB](https://aws.amazon.com/dynamodb/) | User preferences, routines, task history, and session state |
| Auth & Identity | [Amazon Cognito](https://aws.amazon.com/cognito/) | Secure sign-up, sign-in, and access control |
| Web Scraping & Data | [Apify](https://apify.com/) | Automated web extraction, job searching, form data, research |
| File & Document Storage | [Box](https://www.box.com/) | Secure cloud storage for documents, files, and shared content |
| Computer Agent | [Open Interpreter](https://github.com/openinterpreter/open-interpreter) | Local code execution on the user's machine; LLM backend is Bedrock |
| Vision (Primary) | [Qwen3-VL-235B on Bedrock](https://github.com/QwenLM/Qwen3-VL) | Object detection, 2D grounding, scene understanding, OCR |
| Vision (Realtime) | [NVIDIA Nemotron Nano 2 VL on Bedrock](https://arxiv.org/html/2511.03929v2) | Low-latency streaming fallback for phone camera feed |

---

## What Autnio Does

### AI Agent Core — Powered by Amazon Bedrock Agents
Autnio's brain is built on **Amazon Bedrock Agents**, enabling multi-step reasoning and autonomous task execution. The agent receives a natural language request, breaks it into a plan, calls the right tools (Lambda functions, Apify actors, Box APIs, vision models), tracks progress in DynamoDB, and delivers a result — all without manual intervention.

- Orchestrates complex, multi-tool workflows end-to-end
- Maintains context across long-running tasks
- Routes subtasks to the right service (scraping → Apify, files → Box, compute → Open Interpreter, vision → Qwen3-VL or Nemotron)
- Supports voice and text as input channels via Cognito-authenticated web app

### Computer Automation — via Open Interpreter
Autnio's computer automation is a two-tier system: **reasoning in the cloud, execution on your machine**.

- Bedrock Agent plans the task and generates code steps using its OpenAI-compatible mantle endpoint
- A local **[Open Interpreter](https://github.com/openinterpreter/open-interpreter)** client receives tasks from Lambda over a WebSocket relay, then runs Python, JavaScript, or shell code directly on your desktop
- Open applications and navigate websites
- Fill out and submit forms on your behalf
- Send emails, schedule meetings, create documents
- Apply to jobs and execute multi-step workflows

No remote desktop software or VPN required. The cloud thinks; your machine acts.

### Remote Access — Anywhere, Any Device
Control your computer through natural conversation via a **Cognito-authenticated web app** — works in any mobile or desktop browser, no app install required.
- Text or voice commands from any browser
- Bedrock Agent interprets intent → Lambda dispatches task → Open Interpreter executes locally → result returned to your browser
- Authenticated per-session via **Amazon Cognito**
- Web app also serves as the WebSocket relay between Lambda and your local Open Interpreter instance

### Web Research & Data Collection — Powered by Apify
**Apify** actors handle all structured web data needs:
- Job listings discovery and auto-application pipelines
- Price monitoring, competitive research, and news aggregation
- Form pre-filling using scraped public data
- Real-time information retrieval for AI-assisted decisions

### File & Document Management — via Box
All files, documents, and shared content flow through **Box**:
- Securely store, retrieve, and organize files by voice command
- Auto-save documents created by Autnio to your Box workspace
- Share files with collaborators directly from a conversation
- Integrate with Box Sign for document workflows
- Phone camera can trigger document reads from Box in real time

### Accessibility & Real-World Vision
Autnio provides real-time awareness for blind and visually impaired users via a dual vision model stack, both served through Amazon Bedrock:

- **Object detection & grounding** — [Qwen3-VL-235B](https://github.com/QwenLM/Qwen3-VL) with 2D bounding-box output for precise localization
- **Realtime hazard alerts** — [Nemotron Nano 2 VL](https://arxiv.org/html/2511.03929v2) (12B, hybrid Mamba-Transformer) processes continuous phone camera frames at low latency
- **Scene descriptions** — understand surroundings instantly
- **Indoor & outdoor navigation** — step-by-step guidance
- **Document & sign reading** — OCR via Qwen3-VL-235B, including Box-stored docs
- **People & vehicle awareness** — know who and what is nearby
- **Emergency safety monitoring** — continuous background safety checks

**Vision routing:** Bedrock Agent routes continuous streams to Nemotron Nano 2 VL for speed; on-demand detection and sign reading go to Qwen3-VL-235B for accuracy. Automatic fallback if Qwen times out.

### Personalized Automation — Stored in DynamoDB
**DynamoDB** stores every preference, routine, and workflow Autnio learns:
- User preference profiles (communication style, app defaults, schedules)
- Named workflows ("morning setup", "job hunt mode", "travel prep")
- Session history and task logs for context continuity
- Per-user trigger rules for automated routines

---

## Architecture

```
Web App / Phone Camera (User's device)
            │
            ▼
    Amazon Cognito ── auth & identity
            │
            ▼
  Amazon Bedrock Agent ── orchestration & reasoning
            │
   ┌────────┼──────────┬──────────────┐
   ▼        ▼          ▼              ▼
AWS Lambda  Apify   Box API     Vision Models
   │       (scrape) (files)     ├─ Qwen3-VL-235B (detection)
   │                             └─ Nemotron Nano 2 VL (realtime)
   │ WebSocket relay (via web app)
   ▼
Open Interpreter (user's machine)
   └─ exec() ── opens apps, fills forms, runs scripts
            │
            ▼
    Amazon DynamoDB ── state, preferences, history
```

Every user action flows through Cognito for authentication, hits the Bedrock Agent for intelligent orchestration, and fans out to Lambda, Apify, Box, and vision models depending on what the task requires. Computer automation tasks are dispatched over a WebSocket relay to the user's local Open Interpreter instance for execution. State and memory persist in DynamoDB.

---

## Key Capabilities

| Category | Features | Powered By |
|---|---|---|
| AI Orchestration | Multi-step planning, tool use, autonomous execution | Amazon Bedrock Agents |
| Compute & Automation | App control, browser automation, form filling, scripting via local exec | Open Interpreter + Bedrock |
| Auth & Security | User accounts, session tokens, access control | Amazon Cognito |
| Persistence & Memory | Preferences, routines, task history, state | Amazon DynamoDB |
| Web Data & Research | Scraping, job hunting, price tracking, research | Apify |
| File Management | Document storage, retrieval, sharing, signing | Box |
| Vision & Accessibility | Object detection (Qwen3-VL-235B), realtime stream (Nemotron Nano 2 VL), navigation, OCR | Bedrock + VL Models |
| Remote Access | Control your computer from anywhere, naturally | Bedrock + Open Interpreter |

---

## Example Workflows

**"Apply to software engineering jobs while I'm commuting"**
→ Cognito authenticates the session → Bedrock Agent plans the workflow → Apify scrapes matching job listings → Lambda dispatches each application as a task → Open Interpreter executes locally: opens browser, fills form, submits → Box stores submitted resumes → DynamoDB logs what was applied to

**"Set up my work environment for Monday morning"**
→ Bedrock Agent triggers the saved "morning setup" routine from DynamoDB → Open Interpreter opens apps, loads tabs, queues emails on your machine → Box syncs the latest project files → done before you sit down

**"Read the contract I stored in Box and summarize the key terms"**
→ Box API retrieves the document → Bedrock Agent reads and reasons over it → summary returned via voice or text

**"I'm at an unfamiliar intersection — what's around me?"**
→ Phone camera streams frames via web app → Bedrock Agent routes to Nemotron Nano 2 VL for live scene description → on request for precise object locations, escalates to Qwen3-VL-235B for grounded bounding-box detection → audio guidance delivered via web app

---

## Getting Started

> Installation guides, SDK setup, and service configuration docs coming soon.

Follow the repo for updates: [github.com/gaganshivakumara/Autnio](https://github.com/gaganshivakumara/Autnio)

### Prerequisites
- AWS account with Bedrock, Lambda, DynamoDB, and Cognito enabled
- Bedrock model access enabled for `qwen.qwen3-vl-235b-a22b` and `nvidia.nemotron-nano-12b-v2`
- Apify account + API token
- Box developer account + OAuth credentials
- Node.js 18+ (for local agent tooling)
- Python 3.10+ with Open Interpreter installed (`pip install open-interpreter`)
- Local Open Interpreter server running on user's machine (`interpreter.server()`)

---

## Vision

Most AI tools live in one place — a chat window, a browser tab, an app. Autnio is different. Backed by enterprise-grade AWS infrastructure, it moves with you, sees what you see, automates what you need automated, and adapts to how you work and live. Whether you're navigating a city, running a business, or just need your computer to handle the day while you're on the go — Autnio is the assistant that actually shows up.

---

## License

See [LICENSE](./LICENSE) for details.
