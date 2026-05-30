# Computer Use Module

This folder contains a self-contained implementation of the Autnio computer-use flow, scoped around relay, WebSocket lifecycle, local execution wiring, and infrastructure support.

It intentionally excludes the dispatch implementation currently located in `functions/agent/dispatch.py`, but defines the integration contract needed for that handoff.

## Scope

Included:

- Browser relay to local Open Interpreter
- WebSocket connect/disconnect/result Lambda handlers
- Minimal direct AWS API provisioning for WebSocket + DynamoDB tables
- Local testing scripts and integration tests
- Protocol contract shared with Dev 2 and Dev 4

Excluded:

- Dev 2 backend automation dispatch
- Full Autnio web app
- Full repo-wide infra stacks

## Folder Layout

```text
computer-use/
├── README.md
├── docs/
│   └── message-protocol.md
├── interpreter/
│   └── default.yaml
├── relay/
│   ├── OIRelay.ts
│   ├── types.ts
│   └── index.ts
├── web-demo/
├── lambdas/
├── infra/
├── scripts/
└── tests/
```

## Integration Contract (Dispatch + Dev 2)

Current repository state:

- `functions/agent/dispatch.py` currently returns a `503` placeholder (`pending_dev3`) and does not yet push WebSocket messages.
- `agent/schemas/computer-automation.json` defines `/dispatch` with required `task` + `userId` and optional `sessionId`.

When dispatch is implemented, it must send `type=task` payloads matching `docs/message-protocol.md`. The relay accepts missing `taskId` for compatibility and will generate one.

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

Expected outputs sent back by relay:

- `output` chunks while running
- `done` when complete
- `error` when relay/OI fails

## Open Interpreter Local Endpoint

Relay uses Open Interpreter's OpenAI-compatible route:

- `POST http://localhost:8000/openai/chat/completions`
- streaming SSE enabled (`stream: true`)

Do not use `GET /chat` here; that is not the built-in OpenAI-compatible contract.

## Quick Start

1. Install Open Interpreter and dependencies:

   ```bash
   pip install open-interpreter
   ```

2. Start local OI server (from this folder):

   ```bash
   ./scripts/start-oi.sh
   ```

3. Start local WebSocket mock server:

   ```bash
   python3 ./scripts/local-ws-mock.py
   ```

4. Run web demo:

   ```bash
   cd ./web-demo
   npm install
   npm run dev
   ```

5. Open the printed URL and run a simulated task.

## macOS Local Install

Bootstrap all local prerequisites:

```bash
./scripts/macos-bootstrap.sh
```

Optional: auto-start Open Interpreter at login using `launchd`:

```bash
./scripts/setup-launchd.sh
```

## AWS Deployment (Computer-Use Only, no CDK)

`infra/provision.mjs` provisions directly through AWS APIs:

- WebSocket API (`$connect`, `$disconnect`, `$default`)
- `connections` DynamoDB table
- `tasks` DynamoDB table
- three Lambda handlers from `lambdas/`

Install infra deps and deploy:

```bash
cd ./infra
npm install
npm run deploy
```

Outputs are written to `infra/deployment-outputs.json` and printed in stdout.

Share these after deploy:

- `WEBSOCKET_API_ENDPOINT` for Dev 2 dispatch Lambda
- `CONNECTIONS_TABLE_NAME`, `TASKS_TABLE_NAME` for Dev 2 and ws handlers
- `VITE_WS_API_URL` for web clients

Current deployed values (latest run):

- `WEBSOCKET_API_ENDPOINT`: `wss://3cil79jtm9.execute-api.us-east-1.amazonaws.com/dev`
- `CONNECTIONS_TABLE_NAME`: `autnio-computer-use-dev-connections`
- `TASKS_TABLE_NAME`: `autnio-computer-use-dev-tasks`
- `VITE_WS_API_URL`: `wss://3cil79jtm9.execute-api.us-east-1.amazonaws.com/dev`

Integration notes for pulled files:

- Update `web/.env.example` value for `VITE_WS_API_URL` from placeholder to the deployed WebSocket endpoint.
- Dispatch implementation in `functions/agent/dispatch.py` can read this endpoint from environment and call `post_to_connection`.
- The reference schema copy for Dev 1 is stored at `computer-use/agent/schemas/computer-automation.json`.

Full handoff details are in `docs/handoff.md`.

To tear down created resources:

```bash
cd ./infra
npm run destroy
```

## Security Notes

- Never commit AWS credentials, Box credentials, or tokens.
- Use local AWS profiles (`~/.aws/credentials`) or environment variables.
- Rotate any key that was shared in plaintext.
