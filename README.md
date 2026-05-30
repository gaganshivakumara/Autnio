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

---

## What Autnio Does

### AI Agent Core — Powered by Amazon Bedrock Agents
Autnio's brain is built on **Amazon Bedrock Agents**, enabling multi-step reasoning and autonomous task execution. The agent receives a natural language request, breaks it into a plan, calls the right tools (Lambda functions, Apify actors, Box APIs), tracks progress in DynamoDB, and delivers a result — all without manual intervention.

- Orchestrates complex, multi-tool workflows end-to-end
- Maintains context across long-running tasks
- Routes subtasks to the right service (scraping → Apify, files → Box, compute → Lambda)
- Supports voice, text, and phone as input channels

### Computer Automation — via AWS Lambda
Every automation Autnio performs is executed through serverless **Lambda functions** triggered by the Bedrock Agent:
- Open applications and navigate websites
- Fill out and submit forms on your behalf
- Send emails, schedule meetings, create documents
- Apply to jobs and execute multi-step workflows

### Remote Access — Anywhere, Any Device
Control your computer through natural conversation — no VPN, no remote desktop software.
- Voice calls, text messages, or phone commands
- Bedrock Agent interprets intent → Lambda executes the task → result returned to your device
- Authenticated per-session via **Amazon Cognito**

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
- Smart glasses can trigger document reads from Box in real time

### Accessibility & Real-World Vision
Autnio provides real-time awareness for blind and visually impaired users via computer vision and smart glasses integration:
- **Obstacle detection** — real-time hazard alerts
- **Scene descriptions** — understand surroundings instantly
- **Indoor & outdoor navigation** — step-by-step guidance
- **Object finding** — locate items in your environment
- **Document & sign reading** — OCR powered, including Box-stored docs
- **People & vehicle awareness** — know who and what is nearby
- **Emergency safety monitoring** — continuous background safety checks

### Personalized Automation — Stored in DynamoDB
**DynamoDB** stores every preference, routine, and workflow Autnio learns:
- User preference profiles (communication style, app defaults, schedules)
- Named workflows ("morning setup", "job hunt mode", "travel prep")
- Session history and task logs for context continuity
- Per-user trigger rules for automated routines

---

## Architecture

```
User Input (Voice / Text / Phone / Smart Glasses)
                    │
                    ▼
           Amazon Cognito  ◄── Auth & Identity
                    │
                    ▼
       Amazon Bedrock Agent  ◄── AI Reasoning & Orchestration
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
  AWS Lambda    Apify Actors     Box API
  (Automation)  (Web Data)      (Files & Docs)
        │
        ▼
  Amazon DynamoDB
  (State, Preferences, History)
```

Every user action flows through Cognito for authentication, hits the Bedrock Agent for intelligent orchestration, and fans out to Lambda, Apify, and Box depending on what the task requires. State and memory persist in DynamoDB.

---

## Key Capabilities

| Category | Features | Powered By |
|---|---|---|
| AI Orchestration | Multi-step planning, tool use, autonomous execution | Amazon Bedrock Agents |
| Compute & Automation | App control, email, scheduling, form filling | AWS Lambda |
| Auth & Security | User accounts, session tokens, access control | Amazon Cognito |
| Persistence & Memory | Preferences, routines, task history, state | Amazon DynamoDB |
| Web Data & Research | Scraping, job hunting, price tracking, research | Apify |
| File Management | Document storage, retrieval, sharing, signing | Box |
| Vision & Accessibility | Obstacle detection, navigation, OCR, scene description | Smart Glasses + CV |
| Remote Access | Control your computer from anywhere, naturally | Bedrock + Lambda |

---

## Example Workflows

**"Apply to software engineering jobs while I'm commuting"**
→ Cognito authenticates the session → Bedrock Agent plans the workflow → Apify scrapes matching job listings → Lambda fills and submits applications → Box stores submitted resumes → DynamoDB logs what was applied to

**"Set up my work environment for Monday morning"**
→ Bedrock Agent triggers the saved "morning setup" routine from DynamoDB → Lambda opens apps, loads tabs, queues emails → Box syncs the latest project files → done before you sit down

**"Read the contract I stored in Box and summarize the key terms"**
→ Box API retrieves the document → Bedrock Agent reads and reasons over it → summary returned via voice or text

**"I'm at an unfamiliar intersection — what's around me?"**
→ Smart glasses capture the scene → Vision engine describes surroundings, reads signs → Bedrock Agent cross-references navigation data → audio guidance delivered in real time

---

## Getting Started

> Installation guides, SDK setup, and service configuration docs coming soon.

Follow the repo for updates: [github.com/gaganshivakumara/Autnio](https://github.com/gaganshivakumara/Autnio)

### Prerequisites
- AWS account with Bedrock, Lambda, DynamoDB, and Cognito enabled
- Apify account + API token
- Box developer account + OAuth credentials
- Node.js 18+ (for local agent tooling)

---

## Vision

Most AI tools live in one place — a chat window, a browser tab, an app. Autnio is different. Backed by enterprise-grade AWS infrastructure, it moves with you, sees what you see, automates what you need automated, and adapts to how you work and live. Whether you're navigating a city, running a business, or just need your computer to handle the day while you're on the go — Autnio is the assistant that actually shows up.

---

## License

See [LICENSE](./LICENSE) for details.
