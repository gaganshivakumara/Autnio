# Computer Use Module

This folder contains the Autnio computer-use flow: an Anthropic Computer Use
agentic loop (backed by AWS Bedrock) that runs on the user's local machine,
controlled remotely via the Autnio WebSocket relay.

## How it works

```
Dashboard chat  →  Bedrock Agent  →  dispatch Lambda
                                              │
                                   post_to_connection (type=task)
                                              │
                                    API Gateway WebSocket
                                              │
                               run-agent.py (local machine)
                                              │
                              ┌───────────────┴───────────────┐
                              │  Bedrock Computer Use loop    │
                              │  Claude ↔ local tools         │
                              │   screenshot → pyautogui      │
                              │   bash → subprocess           │
                              └───────────────────────────────┘
                                              │
                              output / done / error (WebSocket)
```

Tasks are dispatched from the Autnio chat via the Bedrock Agent action group.
The local agent executes tool calls (screenshot, click, type, bash) on the
machine where `run-agent.py` is running, streaming results back over WebSocket.

## Folder Layout

```text
computer-use/
├── README.md
├── agent/
│   ├── config.yaml             ← Bedrock model + system prompt config
│   └── schemas/
├── docs/
│   └── message-protocol.md
├── relay/
│   ├── OIRelay.ts              ← Browser relay (calls agent-server.py)
│   ├── types.ts
│   └── index.ts
├── scripts/
│   ├── run-agent.py            ← Headless local agent (main entry point)
│   ├── agent-server.py         ← HTTP server for browser relay path
│   ├── computer_use_core.py    ← Shared Bedrock loop + tool execution logic
│   ├── requirements.txt
│   └── local-ws-mock.py
├── lambdas/                    ← WS connect/disconnect/result Lambdas
├── infra/
└── tests/
```

## Integration Contract (Dispatch + Dev 2)

The dispatch Lambda pushes `type=task` payloads matching `docs/message-protocol.md`.

Required dispatch payload:

```json
{
  "type": "task",
  "taskId": "uuid-optional",
  "userId": "cognito-sub",
  "sessionId": "optional",
  "task": "natural-language computer task"
}
```

Expected outputs sent back by the local agent:

- `output` chunks while running (action descriptions + Claude text)
- `done` when complete
- `error` when the loop fails

## Quick Start (Headless agent — recommended)

This is the primary usage path. Run this on the machine you want to control.

### 1. Install dependencies

```bash
cd computer-use
python -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

### 2. Configure AWS credentials

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
# Optional: override the Bedrock model
export BEDROCK_MODEL=us.anthropic.claude-sonnet-4-6
```

Or use an AWS profile in `~/.aws/credentials` — boto3 picks it up automatically.

### 3. Run the agent

```bash
python computer-use/scripts/run-agent.py
```

The agent prints an access code and pairing URL. Enter the code in the
Autnio dashboard "Connect Computer" card, then send tasks via chat.

## Browser Relay Path (agent-server.py)

For the landing-page demo where `OIRelay.ts` runs in the browser:

```bash
python computer-use/scripts/agent-server.py
```

This starts a FastAPI server on `http://localhost:8001`. `OIRelay.ts` posts
tasks to `POST /computer-use` and streams NDJSON results back.

## Configuration

Edit `agent/config.yaml` to change:

- `model` — Bedrock model ID (must support `computer_20241022` tools)
- `region` — AWS region
- `max_tokens`, `max_iterations`
- `system_prompt` — instructions sent to Claude on every task

All fields can also be overridden by environment variables.

## macOS prerequisites

`pyautogui` requires screen recording permission:

1. **System Preferences → Privacy & Security → Screen Recording** → add Terminal / your shell.
2. **Accessibility** → add Terminal.

Bootstrap helper:

```bash
./scripts/macos-bootstrap.sh
```

## AWS Deployment (WebSocket infra)

`infra/provision.mjs` provisions the API Gateway WebSocket + DynamoDB tables
needed by the relay:

```bash
cd ./infra
npm install
npm run deploy
```

Current deployed values:

- `WEBSOCKET_API_ENDPOINT`: `wss://3cil79jtm9.execute-api.us-east-1.amazonaws.com/dev`
- `CONNECTIONS_TABLE_NAME`: `autnio-computer-use-dev-connections`
- `TASKS_TABLE_NAME`: `autnio-computer-use-dev-tasks`

To tear down:

```bash
cd ./infra
npm run destroy
```

## Security Notes

- Never commit AWS credentials.
- Use `~/.aws/credentials` or environment variables — never hardcode keys.
- Rotate any key that was previously shared in plaintext.
- `pyautogui` and the bash tool execute with full local user permissions — only
  accept tasks from trusted Autnio sessions.
