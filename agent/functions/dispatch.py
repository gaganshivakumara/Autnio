from __future__ import annotations

import json
import os
import time
import uuid

import boto3
from botocore.exceptions import ClientError

from bedrock_util import agent_response, parse_body

dynamodb = boto3.resource("dynamodb")

CONNECTIONS_TABLE_NAME = os.environ.get(
    "CONNECTIONS_TABLE_NAME", "autnio-computer-use-dev-connections"
)
TASKS_TABLE_NAME = os.environ.get(
    "TASKS_TABLE_NAME", "autnio-computer-use-dev-tasks"
)
WS_ENDPOINT = os.environ.get("WEBSOCKET_API_ENDPOINT", "")

# How long to wait for OI to complete before returning a "still running" response.
# Keep this well under the Lambda timeout (which should be set to 120s).
TASK_WAIT_SECONDS = int(os.environ.get("TASK_WAIT_SECONDS", "90"))
TASK_POLL_INTERVAL = 1  # seconds between DynamoDB polls


def _get_connection_id(user_id: str) -> str | None:
    table = dynamodb.Table(CONNECTIONS_TABLE_NAME)
    response = table.get_item(Key={"userId": user_id})
    item = response.get("Item") or {}
    return item.get("connectionId")


def _create_task(task_id: str, user_id: str, task: str, session_id: str) -> None:
    table = dynamodb.Table(TASKS_TABLE_NAME)
    table.put_item(
        Item={
            "taskId": task_id,
            "userId": user_id,
            "task": task,
            "sessionId": session_id or "",
            "status": "pending",
            "createdAt": int(time.time()),
        }
    )


def _wait_for_result(task_id: str) -> dict | None:
    """Poll the tasks table until the task finishes or the timeout is reached.

    Returns the DynamoDB item on completion, or None if the task is still
    running when we hit TASK_WAIT_SECONDS.
    """
    table = dynamodb.Table(TASKS_TABLE_NAME)
    deadline = time.time() + TASK_WAIT_SECONDS
    while time.time() < deadline:
        resp = table.get_item(Key={"taskId": task_id})
        item = resp.get("Item") or {}
        if item.get("status") in ("complete", "failed"):
            return item
        time.sleep(TASK_POLL_INTERVAL)
    return None


def _ws_client():
    if not WS_ENDPOINT:
        raise ValueError("WEBSOCKET_API_ENDPOINT environment variable is not set")
    return boto3.client("apigatewaymanagementapi", endpoint_url=WS_ENDPOINT)


def handler(event, context):
    body = parse_body(event)
    task = body.get("task", "")

    # userId / sessionId can come from the request body or from the session
    # attributes injected by the frontend InvokeAgent call.
    prompt_attrs = event.get("promptSessionAttributes") or {}
    session_attrs = event.get("sessionAttributes") or {}
    user_id = (
        body.get("userId")
        or prompt_attrs.get("userId")
        or session_attrs.get("userId")
        or ""
    )
    session_id = (
        body.get("sessionId")
        or prompt_attrs.get("sessionId")
        or session_attrs.get("sessionId")
        or ""
    )

    if not user_id:
        return agent_response(
            event, 400,
            {"result": "Dispatch failed", "message": "userId is required", "data": {}},
        )
    if not task:
        return agent_response(
            event, 400,
            {"result": "Dispatch failed", "message": "task is required", "data": {}},
        )

    connection_id = _get_connection_id(user_id)
    if not connection_id:
        return agent_response(
            event, 200,
            {
                "result": "Open Interpreter relay not connected",
                "message": (
                    f"No active relay connection for user '{user_id}'. "
                    "Ask the user to open the Autnio web app and ensure the relay shows green."
                ),
                "data": {"status": "relay_disconnected", "task": task},
            },
        )

    task_id = body.get("taskId") or str(uuid.uuid4())
    payload = {
        "type": "task",
        "taskId": task_id,
        "userId": user_id,
        "sessionId": session_id,
        "task": task,
    }

    # ── Send task to the relay ────────────────────────────────────────────────
    try:
        _ws_client().post_to_connection(
            ConnectionId=connection_id, Data=json.dumps(payload).encode("utf-8")
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code == "GoneException":
            return agent_response(
                event, 200,
                {
                    "result": "Relay connection is stale",
                    "message": "The relay WebSocket has expired. Ask the user to reconnect.",
                    "data": {"taskId": task_id},
                },
            )
        return agent_response(
            event, 200,
            {
                "result": "Dispatch failed",
                "message": f"WebSocket error: {code or str(exc)}",
                "data": {"taskId": task_id},
            },
        )
    except Exception as exc:  # noqa: BLE001
        return agent_response(
            event, 200,
            {
                "result": "Dispatch failed",
                "message": f"Unexpected error: {exc}",
                "data": {"taskId": task_id},
            },
        )

    # Create the task record so ws_result can update it.
    try:
        _create_task(task_id, user_id, task, session_id)
    except Exception:  # noqa: BLE001
        pass

    # ── Wait for the result ───────────────────────────────────────────────────
    # Poll DynamoDB until Open Interpreter finishes and the relay posts the
    # result back, or until we hit the wait timeout.
    item = _wait_for_result(task_id)

    if item is None:
        # Task is still running — tell the agent so it can inform the user.
        return agent_response(
            event, 200,
            {
                "result": "Task is running",
                "message": (
                    "The task was dispatched and is still executing on the user's computer. "
                    f"Task ID: {task_id}. The user can watch live output in the Relay tab."
                ),
                "data": {"taskId": task_id, "status": "running"},
            },
        )

    status = item.get("status", "unknown")
    result_text = item.get("result", "")
    chunks = item.get("partialOutput", [])

    # Combine partial chunks as fallback if result field is empty.
    if not result_text and chunks:
        result_text = "".join(chunks) if isinstance(chunks, list) else str(chunks)

    if status == "failed":
        return agent_response(
            event, 200,
            {
                "result": "Task failed",
                "message": result_text or "Open Interpreter reported an error.",
                "data": {"taskId": task_id, "status": "failed"},
            },
        )

    return agent_response(
        event, 200,
        {
            "result": "Task completed",
            "output": result_text,
            "data": {"taskId": task_id, "status": "complete"},
        },
    )
