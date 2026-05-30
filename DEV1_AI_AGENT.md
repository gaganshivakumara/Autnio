# Dev 1 — AI Agent & Orchestration

**Owner:** Dev 1
**Tech:** Amazon Bedrock Agents

---

## Overview

Dev 1 owns the Bedrock Agent — the brain of Autnio. The agent receives natural language requests, breaks them into a plan, calls the right Lambda functions (action groups), and returns a result. All other components are tools the agent uses; this is the layer that decides which tool to call, when, and with what parameters.

**You are blocked until Dev 3 delivers:** Cognito Pool IDs, API Gateway URL, and an AWS environment to deploy into.
**You are blocked on action group registration until Dev 2 delivers:** Lambda ARNs.
**Vision action group registration requires:** Vision Lambda ARN from Dev 4.

---

## Responsibilities

1. Create and configure the Bedrock Agent
2. Write the agent system prompt
3. Define all action group OpenAPI schemas
4. Register action groups with Lambda ARNs (after Dev 2 and Dev 4 deliver)
5. Configure vision routing logic in the agent instructions
6. Create dev and prod agent aliases
7. End-to-end agent testing

---

## Action Groups

The agent has five action groups. Each maps to a set of Lambda functions owned by Dev 2 or Dev 4.

| Action Group | Lambda Owner | Purpose |
|---|---|---|
| `computer-automation` | Dev 2 | Dispatch tasks to local Open Interpreter |
| `web-research` | Dev 2 | Trigger Apify scraping actors |
| `file-management` | Dev 2 | Box file read, write, share |
| `user-preferences` | Dev 2 | DynamoDB profile and routine management |
| `vision` | Dev 4 | Route image frames to Qwen3-VL or Nemotron |

---

## Vision Routing Logic (in system prompt)

The agent decides which vision model to invoke based on context. Include this in the system prompt:

```
When handling vision requests:
- If the request involves a continuous camera stream, real-time hazard detection,
  or the "mode" is "stream", invoke the vision action group with mode="stream".
  This routes to Nemotron Nano 2 VL (low latency, 12B model).
- If the request involves on-demand object detection, sign reading, OCR, or
  scene analysis from a single frame, invoke the vision action group with
  mode="detect". This routes to Qwen3-VL-235B (high accuracy, 235B model).
- If Qwen3-VL-235B times out or returns an error, automatically retry with
  mode="stream" (Nemotron fallback).
```

---

## File Structure

```
agent/
├── schemas/
│   ├── computer-automation.json
│   ├── web-research.json
│   ├── file-management.json
│   ├── user-preferences.json
│   └── vision.json
└── prompts/
    └── system-prompt.md
```

---

## Action Group Schema Examples

### `computer-automation.json` (abridged)
```json
{
  "openapi": "3.0.0",
  "info": { "title": "Computer Automation", "version": "1.0" },
  "paths": {
    "/dispatch": {
      "post": {
        "operationId": "dispatchAutomationTask",
        "description": "Send a computer automation task to Open Interpreter on the user's machine",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["task", "userId"],
                "properties": {
                  "task": { "type": "string", "description": "Natural language task description" },
                  "userId": { "type": "string" },
                  "sessionId": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Task dispatched successfully" },
          "503": { "description": "Open Interpreter not reachable" }
        }
      }
    }
  }
}
```

### `vision.json` (abridged)
```json
{
  "openapi": "3.0.0",
  "info": { "title": "Vision", "version": "1.0" },
  "paths": {
    "/analyze": {
      "post": {
        "operationId": "analyzeFrame",
        "description": "Analyze an image frame using Qwen3-VL-235B (detect) or Nemotron Nano 2 VL (stream)",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["imageS3Key", "userId", "mode"],
                "properties": {
                  "imageS3Key": { "type": "string", "description": "S3 key of the uploaded frame" },
                  "userId": { "type": "string" },
                  "mode": {
                    "type": "string",
                    "enum": ["detect", "stream"],
                    "description": "detect = Qwen3-VL-235B; stream = Nemotron Nano 2 VL"
                  },
                  "prompt": { "type": "string", "description": "Optional instruction e.g. 'read the sign'" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Vision result returned" }
        }
      }
    }
  }
}
```

---

## Agent Setup Steps

1. In the AWS console (or via CDK), create a new Bedrock Agent with your chosen foundation model (Claude 3.5 Sonnet recommended)
2. Paste the contents of `prompts/system-prompt.md` as the agent instruction
3. For each schema in `schemas/`, create an action group and attach the corresponding Lambda ARN from Dev 2 / Dev 4
4. Enable user confirmation prompts off for automation action groups (the agent should act autonomously)
5. Create a `dev` alias pointing to the working draft; create a `prod` alias after testing
6. Share `BEDROCK_AGENT_ID` and `BEDROCK_AGENT_ALIAS_ID` with Dev 3 for API Gateway integration

---

## Needs From Others

| From | What |
|---|---|
| Dev 2 | Lambda ARNs for all 5 action groups |
| Dev 3 | Cognito Pool IDs (for prompt context), AWS environment, IAM role for Bedrock Agent |
| Dev 4 | Vision Lambda ARN |

## Provides To Others

| To | What |
|---|---|
| Dev 3 | `BEDROCK_AGENT_ID` + `BEDROCK_AGENT_ALIAS_ID` |
| Dev 4 | `vision.json` OpenAPI schema (so vision Lambda matches expected I/O exactly) |

---

## Definition of Done

- [ ] Agent successfully routes a computer automation request to Dev 2's dispatch Lambda
- [ ] Agent successfully routes a vision request with `mode=detect` to Qwen3-VL-235B and `mode=stream` to Nemotron
- [ ] Agent triggers Apify scrape, returns structured job listings
- [ ] Agent reads and writes user preferences via DynamoDB through Dev 2's Lambda
- [ ] Agent retrieves and summarizes a Box document
- [ ] All five example workflows from the main README complete end-to-end in the dev environment
- [ ] Agent retries on Lambda 5xx responses with a `message` field