# Dev 2 — Backend, Automation & Data

**Owner:** Dev 2
**Tech:** AWS Lambda, Amazon DynamoDB, Apify, Box, Open Interpreter

---

## Overview

Dev 2 owns the backend execution layer — every Lambda function, the DynamoDB schema, Apify and Box integrations, and the Open Interpreter dispatch pipeline. When the Bedrock Agent decides what to do, it calls Dev 2's Lambda functions to actually do it.

The most critical piece unique to Dev 2 is the **Open Interpreter dispatch system**: Lambda receives an automation task from the agent, pushes it over a WebSocket relay to the user's locally running Open Interpreter server, and streams the results back.

**You can build and test locally with mock events before Dev 3's infra is ready.**
**You are blocked on the real WebSocket relay URL until Dev 3 delivers the API Gateway WebSocket endpoint.**

---

## Responsibilities

1. Write all Lambda function handlers
2. Design and validate the DynamoDB schema
3. Integrate Apify (web scraping) and Box (file storage)
4. Build the Open Interpreter dispatch pipeline (WebSocket task push + result streaming)
5. Write and maintain the Open Interpreter config profile

---

## Lambda Functions

All handlers must return the shared response format:

```json
{ "statusCode": 200, "body": { "result": "...", "data": {} } }
```

Errors must return `statusCode` 4xx/5xx with a `"message"` field — the Bedrock Agent uses this to decide whether to retry.

### Function List

| Handler file | Action group | What it does |
|---|---|---|
| `functions/automation/dispatch.py` | `computer-automation` | Receives task from Agent, pushes to Open Interpreter via WebSocket relay |
| `functions/data/apify-scrape.py` | `web-research` | Triggers Apify actor by ID, polls for result, returns structured data |
| `functions/files/box-read.py` | `file-management` | Fetches file or document content from Box by path or file ID |
| `functions/files/box-write.py` | `file-management` | Uploads content to Box, returns the shared link |
| `functions/files/box-share.py` | `file-management` | Updates Box item sharing permissions |
| `functions/user/get-profile.py` | `user-preferences` | Reads user preferences and named routines from DynamoDB |
| `functions/user/update-profile.py` | `user-preferences` | Writes updated preferences or routines to DynamoDB |
| `functions/user/log-task.py` | `user-preferences` | Appends a completed task entry to task history |

---

## Open Interpreter Dispatch

### How it works

The user runs `interpreter.server()` on their machine, which starts a local FastAPI server (default port 8000) with a `/chat` endpoint. Dev 4's web app maintains a persistent WebSocket connection to API Gateway. When Lambda needs to send a task to Open Interpreter, it pushes a message into that WebSocket connection; the browser relays it to `localhost:8000/chat` and streams the output back.

```
Bedrock Agent
     │
     ▼
dispatch Lambda
     │  push task via API Gateway WebSocket
     ▼
Dev 4 web app (browser, running on user's device)
     │  relay to localhost:8000
     ▼
interpreter.server() on user's machine
     │  exec() — runs Python/JS/shell
     ▼
Result streamed back through same relay
```

### `dispatch.py` outline

```python
import boto3, json, os

apigateway = boto3.client(
    'apigatewaymanagementapi',
    endpoint_url=os.environ['WEBSOCKET_API_ENDPOINT']
)

def handler(event, context):
    body = json.loads(event['body'])
    task = body['task']
    user_id = body['userId']
    session_id = body.get('sessionId', '')

    # Look up the user's active WebSocket connection ID from DynamoDB
    connection_id = get_connection_id(user_id)
    if not connection_id:
        return {'statusCode': 503, 'body': json.dumps({'message': 'Open Interpreter not connected'})}

    # Push task to the browser relay
    payload = json.dumps({'task': task, 'sessionId': session_id, 'userId': user_id})
    apigateway.post_to_connection(ConnectionId=connection_id, Data=payload.encode())

    return {'statusCode': 200, 'body': json.dumps({'result': 'Task dispatched', 'data': {}})}
```

### Open Interpreter config profile

`interpreter/default.yaml` — shipped with the repo, user drops it into their OI profiles directory:

```yaml
llm:
  model: openai/anthropic.claude-3-5-sonnet-20241022-v2:0
  api_base: https://bedrock-mantle.us-east-1.api.aws/v1
  api_key: REPLACE_WITH_BEDROCK_API_KEY
auto_run: true
safe_mode: off
```

OI uses LiteLLM internally. Pointing `api_base` at Bedrock's mantle endpoint makes it use Bedrock as the LLM — no OpenRouter or separate proxy needed.

To load the profile:
```bash
interpreter --profile default.yaml
# or programmatically:
interpreter.server()
```

---

## DynamoDB Schema

### `users` table

**Primary key:** `userId` (String)

| Attribute | Type | Description |
|---|---|---|
| `userId` | String | Cognito sub (unique per user) |
| `preferences` | Map | Communication style, app defaults, schedules |
| `routines` | Map | Named workflows e.g. `"morning-setup"`, `"job-hunt-mode"` |
| `sessionState` | Map | Last context, active task ID, last accessed |

Example item:
```json
{
  "userId": "abc-123",
  "preferences": {
    "communicationStyle": "concise",
    "defaultBrowser": "Chrome",
    "timezone": "America/Los_Angeles"
  },
  "routines": {
    "morning-setup": "Open VS Code, load project files, check email",
    "job-hunt-mode": "Search YC jobs, LinkedIn, filter by React"
  },
  "sessionState": {
    "lastTask": "apply-jobs",
    "lastActive": "2026-05-29T21:00:00Z"
  }
}
```

### `tasks` table

**Primary key:** `taskId` (String) | **Sort key:** `userId` (String)

| Attribute | Type | Description |
|---|---|---|
| `taskId` | String | UUID |
| `userId` | String | Cognito sub |
| `description` | String | What was asked |
| `status` | String | `pending` / `running` / `complete` / `failed` |
| `result` | String | Output or error message |
| `timestamp` | String | ISO 8601 |

---

## Apify Integration

Use the [Apify API](https://docs.apify.com/api/v2) to trigger actors and retrieve results.

```python
import requests, os, time

APIFY_TOKEN = os.environ['APIFY_API_TOKEN']

def run_actor(actor_id: str, input_data: dict) -> dict:
    # Start actor run
    r = requests.post(
        f'https://api.apify.com/v2/acts/{actor_id}/runs',
        headers={'Authorization': f'Bearer {APIFY_TOKEN}'},
        json={'input': input_data}
    )
    run_id = r.json()['data']['id']

    # Poll until finished
    while True:
        status = requests.get(
            f'https://api.apify.com/v2/actor-runs/{run_id}',
            headers={'Authorization': f'Bearer {APIFY_TOKEN}'}
        ).json()['data']['status']
        if status in ('SUCCEEDED', 'FAILED', 'ABORTED'):
            break
        time.sleep(2)

    # Return dataset items
    items = requests.get(
        f'https://api.apify.com/v2/actor-runs/{run_id}/dataset/items',
        headers={'Authorization': f'Bearer {APIFY_TOKEN}'}
    ).json()
    return items
```

Useful actors for Autnio:
- Job listings: `apify/indeed-scraper` or `curious_coder/linkedin-jobs-scraper`
- General web: `apify/web-scraper`

---

## Box Integration

Use the [Box Python SDK](https://github.com/box/box-python-sdk) with a service account (JWT auth).

```python
from boxsdk import JWTAuth, Client
import os, json

def get_box_client():
    config = JWTAuth.from_settings_dictionary(json.loads(os.environ['BOX_CONFIG_JSON']))
    return Client(config)

def read_file(file_id: str) -> str:
    client = get_box_client()
    return client.file(file_id).content().decode('utf-8')

def write_file(folder_id: str, filename: str, content: bytes) -> str:
    client = get_box_client()
    f = client.folder(folder_id).upload_stream(content, filename)
    return f.get_shared_link(access='open')
```

---

## File Structure

```
functions/
├── automation/
│   └── dispatch.py
├── data/
│   └── apify-scrape.py
├── files/
│   ├── box-read.py
│   ├── box-write.py
│   └── box-share.py
└── user/
    ├── get-profile.py
    ├── update-profile.py
    └── log-task.py
interpreter/
└── default.yaml
```

---

## Needs From Others

| From | What |
|---|---|
| Dev 3 | IAM roles for each Lambda, Secrets Manager paths, DynamoDB table names, API Gateway WebSocket endpoint URL |

## Provides To Others

| To | What |
|---|---|
| Dev 1 | All Lambda ARNs (to register action groups), OI WebSocket message format |
| Dev 4 | `get-profile` and `box-read` Lambda ARNs (for web app user context) |

---

## Definition of Done

- [ ] All Lambda functions pass local unit tests using mock API Gateway events
- [ ] `dispatch.py` pushes a task to a locally running `interpreter.server()` and receives streaming output
- [ ] Apify scrape returns structured job listings for a test query
- [ ] Box read/write/share functions work against a real Box sandbox account
- [ ] DynamoDB reads and writes verified against a real table in the dev environment
- [ ] `interpreter/default.yaml` profile tested locally — OI uses Bedrock as LLM backend and runs a task autonomously (`auto_run: true`)
