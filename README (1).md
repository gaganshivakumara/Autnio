# Autnio — Team Build Guide

**4 developers. 4 ownership areas. One unified AI platform.**

This folder divides the full Autnio build across a team of four. Each developer owns a clear slice of the system with defined deliverables, handoff points, and a definition of done.

---

## Who Builds What

| Dev | Area | Core Tech |
|---|---|---|
| [Dev 1](./DEV1_AI_AGENT.md) | AI Agent & Orchestration | Amazon Bedrock Agents |
| [Dev 2](./DEV2_BACKEND.md) | Backend, Automation & Data | AWS Lambda, DynamoDB, Apify, Box |
| [Dev 3](./DEV3_INFRA.md) | Auth, Infrastructure & DevOps | Cognito, CDK, API Gateway, CI/CD |
| [Dev 4](./DEV4_VISION.md) | Vision, Mobile & Smart Glasses | Rekognition, Textract, Polly, React Native |

---

## How the Pieces Connect

```
User (Voice / Text / Phone / Smart Glasses)
                │
                ▼
        API Gateway  ◄──────────── Dev 3 (infra + auth)
                │
         Cognito JWT
                │
                ▼
     Bedrock Agent  ◄──────────── Dev 1 (agent + orchestration)
                │
    ┌───────────┼────────────┐
    ▼           ▼            ▼
 Lambda      Apify         Box
 Functions   Actors        API
    └───────────────────────┘
             Dev 2 (backend + data)
                │
           DynamoDB
                │
        ┌───────┴────────┐
        ▼                ▼
  Vision Lambdas    Mobile App
  Rekognition       Smart Glasses
  Textract / Polly
        Dev 4 (vision + mobile)
```

---

## Shared Conventions

### Repo Structure
```
autnio/
├── agent/            # Dev 1 — Bedrock schemas and prompt config
├── functions/        # Dev 2 — Lambda handlers
│   ├── automation/
│   ├── files/
│   ├── data/
│   ├── user/
│   └── vision/       # Dev 4 — vision Lambda handlers
├── infra/            # Dev 3 — CDK stacks
├── mobile/           # Dev 4 — React Native app
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

1. **Dev 3 first** — provision infra, Cognito, DynamoDB, API Gateway, and CI/CD pipeline. Everyone else depends on this.
2. **Dev 2 in parallel** — build Lambda functions and DynamoDB schema. Can be tested locally with mock events.
3. **Dev 1 after Dev 2** — needs Lambda ARNs to register action groups.
4. **Dev 4 in parallel with Dev 1** — vision Lambdas can be built and tested independently; mobile app needs Cognito config from Dev 3.

---

## Handoff Matrix

| Provides → | Dev 1 | Dev 2 | Dev 3 | Dev 4 |
|---|---|---|---|---|
| **Dev 1** | — | — | — | `vision` action group schema |
| **Dev 2** | Lambda ARNs | — | DynamoDB table name, IAM needs | `get-profile`, `box-read` functions |
| **Dev 3** | Cognito Pool IDs, JWT setup | IAM roles, Secrets paths | — | API Gateway URL, IAM role for vision |
| **Dev 4** | Vision Lambda ARNs | — | Mobile app bundle | — |

---

## Prerequisites (Dev 3 sets these up — everyone else just uses them)

- AWS account with Bedrock, Lambda, DynamoDB, Cognito, Rekognition, Textract, Polly, SES enabled
- Apify account + API token
- Box developer account + OAuth 2.0 app credentials
- GitHub repo with Actions enabled
- Node.js 18+

---

Follow the repo: [github.com/gaganshivakumara/Autnio](https://github.com/gaganshivakumara/Autnio)
