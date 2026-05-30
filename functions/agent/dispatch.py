import json
import os
import uuid

import boto3
from botocore.exceptions import ClientError

from bedrock_util import agent_response, parse_body

dynamodb = boto3.resource("dynamodb")
CONNECTIONS_TABLE_NAME = os.environ.get(
    "CONNECTIONS_TABLE_NAME", "autnio-computer-use-dev-connections"
)
WS_ENDPOINT = os.environ.get("WEBSOCKET_API_ENDPOINT", "")


def _get_connection_id(user_id: str) -> str | None:
    table = dynamodb.Table(CONNECTIONS_TABLE_NAME)
    response = table.get_item(Key={"userId": user_id})
    item = response.get("Item") or {}
    return item.get("connectionId")


def _ws_client():
    if not WS_ENDPOINT:
        raise ValueError("WEBSOCKET_API_ENDPOINT environment variable is not set")
    return boto3.client("apigatewaymanagementapi", endpoint_url=WS_ENDPOINT)


def handler(event, context):
    body = parse_body(event)
    task = body.get("task", "")
    user_id = body.get("userId", "")
    session_id = body.get("sessionId", "")

    if not user_id:
        return agent_response(
            event,
            400,
            {"result": "Dispatch failed", "message": "userId is required", "data": {}},
        )
    if not task:
        return agent_response(
            event,
            400,
            {"result": "Dispatch failed", "message": "task is required", "data": {}},
        )

    connection_id = _get_connection_id(user_id)
    if not connection_id:
        return agent_response(
            event,
            503,
            {
                "result": "Open Interpreter relay not connected",
                "message": f"No active relay connection for user {user_id}",
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

    try:
        _ws_client().post_to_connection(
            ConnectionId=connection_id, Data=json.dumps(payload).encode("utf-8")
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        status = 410 if code == "GoneException" else 503
        message = (
            "Relay connection is stale; reconnect required"
            if code == "GoneException"
            else f"WebSocket dispatch failed: {code or str(exc)}"
        )
        return agent_response(
            event,
            status,
            {
                "result": "Dispatch failed",
                "message": message,
                "data": {"taskId": task_id, "connectionId": connection_id},
            },
        )
    except Exception as exc:  # noqa: BLE001
        return agent_response(
            event,
            503,
            {
                "result": "Dispatch failed",
                "message": f"Unexpected dispatch error: {exc}",
                "data": {"taskId": task_id},
            },
        )

    return agent_response(
        event,
        200,
        {
            "result": "Task dispatched",
            "data": {"taskId": task_id, "connectionId": connection_id},
        },
    )
