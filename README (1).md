# Autnio — Team Build Guide

**4 developers. 4 ownership areas. One unified AI platform.**

This guide divides the full Autnio build across a team of four. Each developer owns a clear slice of the system with defined deliverables, handoff points, and a definition of done.

---

## Who Builds What

| Dev | Area | Core Tech |
|---|---|---|
| [Dev 1](./DEV1_AI_AGENT.md) | AI Agent & Orchestration | Amazon Bedrock Agents |
| [Dev 2](./DEV2_BACKEND.md) | Backend, Automation & Data | AWS Lambda, DynamoDB, Apify, Box, Open Interpreter |
| [Dev 3](./DEV3_INFRA.md) | Auth, Infrastructure & DevOps | Cognito, CDK, API Gateway, CI/CD, Web Hosting |
| [Dev 4](./DEV4_VISION.md) | Vision & Web App | Qwen3-VL-235B, Nemotron Nano 2 VL (Bedrock), React Web App |
| [Dev 5](./DEV5_VOICE.md) | Voice Commands | Amazon Transcribe (STT), Amazon Polly (TTS), AWS Lambda |

---

## How the Pieces Connect

```
Web App / Phone Camera / Mic (User's device)
                │
         ┌──────┴──────┐
         ▼             ▼
  Voice input       Text / camera
  (MediaRecorder)   input
         │             │
         ▼             │
  Transcribe Lambda    │   Dev 5 (voice)
  (Amazon Transcribe)  │
         │             │
         └──────┬──────┘
                ▼
        API Gateway  ◄──────────── Dev 3 (infra + auth)
                │
         Cognito JWT
                │
                ▼
     Bedrock Agent  ◄──────────── Dev 1 (agent + orchestration)
                │
    ┌───────────┼────────────┬──────────────┐
    ▼           ▼            ▼              ▼
 Lambda      Apify         Box          Vision Models
 Functions   Actors        API          ├─ Qwen3-VL-235B
    │                                   └─ Nemotron Nano 2 VL
    │  Dev 2 (backend + data + OI dispatch)     Dev 4 (vision)
    │
    │ WebSocket relay (via Dev 4 web app)
    ▼
Open Interpreter (user's local machine)
   └─ exec() on user's desktop
            │
            ▼
       DynamoDB  ◄──── state, preferences, history
            │
            ▼
   Agent response text
            │
            ▼
   TTS Lambda (Amazon Polly)  ◄── Dev 5 (voice)
            │
            ▼
   Audio played back to user
```

---

## Shared Conventions

### Repo Structure
```
autnio/
├── agent/            # Dev 1 — Bedrock schemas and prompt config
│   ├── schemas/      # OpenAPI action group definitions
│   └── prompts/      # Agent system prompt
├── functions/        # Lambda handlers
│   ├── automation/   # Dev 2 — OI dispatch
│   ├── files/        # Dev 2 — Box integration
│   ├── data/         # Dev 2 — Apify integration
│   ├── user/         # Dev 2 — DynamoDB profile/history
│   ├── vision/       # Dev 4 — Qwen/Nemotron vision handlers
│   └── voice/        # Dev 5 — Transcribe + Polly handlers
├── interpreter/      # Dev 2 — Open Interpreter config
├── infra/            # Dev 3 — CDK stacks
├── web/              # Dev 4 — React web app
└── docs/             # This folder
```

### Environment Variables (all set by Dev 3 via Secrets Manager)
```
AWS_REGION
BEDROCK_AGENT_ID
BEDROCK_AGENT_ALIAS_ID
DYNAMODB_TABLE
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
APIFY_API_TOKEN
BOX_CLIENT_ID
BOX_CLIENT_SECRET
BOX_CONFIG_JSON
QWEN_VL_MODEL_ID          # qwen.qwen3-vl-235b-a22b
NEMOTRON_VL_MODEL_ID      # nvidia.nemotron-nano-12b-v2
OI_BEDROCK_MODEL_ID       # Bedrock model ID used by Open Interpreter
POLLY_VOICE_ID            # e.g. Joanna (neural TTS voice)
```

### Response Format (all Lambda functions)
```json
{
  "statusCode": 200,
  "body": {
    "result": "...",
    "data": {}
  }
}
```
Errors must return `statusCode` 4xx/5xx with a `message` field so the Bedrock Agent can handle retries gracefully.

### Branch Strategy
- `main` → production (auto-deploy via Dev 3's pipeline)
- `develop` → shared dev environment
- `feature/<name>` → individual feature work
- PRs require one review before merging to `develop`

---

## Build Order

Start here to avoid blockers:

1. **Dev 3 first** — provision infra, Cognito, DynamoDB, API Gateway (REST + WebSocket), and CI/CD pipeline. Everyone else depends on this.
2. **Dev 2 in parallel** — build Lambda functions and DynamoDB schema. Can be tested locally with mock events. Also sets up Open Interpreter config and WebSocket dispatch logic.
3. **Dev 5 in parallel with Dev 2** — Transcribe and Polly Lambdas can be built and tested locally independently. Coordinate with Dev 3 for IAM roles and API routes, and with Dev 4 on the audio interface spec.
4. **Dev 1 after Dev 2** — needs Lambda ARNs to register action groups.
5. **Dev 4 in parallel with Dev 1** — vision Lambdas and web app can be built independently once Dev 3 delivers Cognito config and API Gateway URLs. Wire Dev 5's audio endpoints after Dev 5 delivers them.

---

## Handoff Matrix

| Provides → | Dev 1 | Dev 2 | Dev 3 | Dev 4 | Dev 5 |
|---|---|---|---|---|---|
| **Dev 1** | — | — | Agent ID + Alias ID | `vision` action group schema | — |
| **Dev 2** | Lambda ARNs, OI WebSocket message format | — | DynamoDB table name, IAM needs | `get-profile`, `box-read` Lambda ARNs | — |
| **Dev 3** | Cognito Pool IDs, JWT setup | IAM roles, Secrets paths, WebSocket API URL | — | API Gateway URLs, Cognito config | VoiceLambdaRole, `/voice/*` API routes |
| **Dev 4** | Vision Lambda ARNs | OI WebSocket relay client (browser-side) | Web app build (for S3/CloudFront deploy) | — | Audio interface integration (mic capture + playback) |
| **Dev 5** | — | — | Transcribe + Polly Lambda code + IAM requirements | `/voice/transcribe` + `/voice/tts` endpoint URLs + audio interface spec | — |

---

## Prerequisites (Dev 3 sets these up — everyone else just uses them)

- AWS account with Bedrock, Lambda, DynamoDB, Cognito, and API Gateway enabled
- Bedrock model access for `qwen.qwen3-vl-235b-a22b` and `nvidia.nemotron-nano-12b-v2`
- Amazon Transcribe and Amazon Polly enabled in your AWS region
- Apify account + API token
- Box developer account + OAuth 2.0 app credentials
- GitHub repo with Actions enabled
- Node.js 18+ (CDK + web app)
- Python 3.10+ with `open-interpreter` installed (`pip install open-interpreter`)

---

Follow the repo: [github.com/gaganshivakumara/Autnio](https://github.com/gaganshivakumara/Autnio)
