from __future__ import annotations

import json
from typing import Any

from common import json_body, now_epoch, tasks_table


def _parse_body(event: dict[str, Any]) -> dict[str, Any]:
    raw = event.get("body")
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    return json.loads(raw)


def _mark_running(task_id: str, chunk: str) -> None:
    """Append output chunk to a list in DynamoDB (list_append is the only
    safe way to grow a string-like field — DynamoDB SET + is numeric-only)."""
    table = tasks_table()
    table.update_item(
        Key={"taskId": task_id},
        UpdateExpression=(
            "SET #status = :status, "
            "updatedAt = :updatedAt, "
            "partialOutput = list_append(if_not_exists(partialOutput, :empty), :chunk)"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":status": "running",
            ":updatedAt": now_epoch(),
            ":empty": [],
            ":chunk": [chunk],
        },
    )


def _mark_done(task_id: str, result_text: str | None) -> None:
    table = tasks_table()
    table.update_item(
        Key={"taskId": task_id},
        UpdateExpression="SET #status = :status, #result = :result, updatedAt = :updatedAt",
        ExpressionAttributeNames={"#status": "status", "#result": "result"},
        ExpressionAttributeValues={
            ":status": "complete",
            ":result": result_text or "",
            ":updatedAt": now_epoch(),
        },
    )


def _mark_error(task_id: str, message: str) -> None:
    table = tasks_table()
    table.update_item(
        Key={"taskId": task_id},
        UpdateExpression="SET #status = :status, #result = :result, updatedAt = :updatedAt",
        ExpressionAttributeNames={"#status": "status", "#result": "result"},
        ExpressionAttributeValues={
            ":status": "failed",
            ":result": message,
            ":updatedAt": now_epoch(),
        },
    )


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    try:
        body = _parse_body(event)
    except Exception as exc:  # noqa: BLE001
        return json_body({"message": f"Invalid JSON body: {exc}"}, 400)

    message_type = body.get("type")
    task_id = body.get("taskId")
    if not isinstance(task_id, str) or not task_id:
        return json_body({"message": "taskId is required"}, 400)

    if message_type == "output":
        data = body.get("data")
        if not isinstance(data, str):
            return json_body({"message": "output.data must be a string"}, 400)
        _mark_running(task_id, data)
        return json_body({"message": "Output accepted"})

    if message_type == "done":
        result = body.get("result")
        if result is not None and not isinstance(result, str):
            return json_body({"message": "done.result must be a string"}, 400)
        _mark_done(task_id, result)
        return json_body({"message": "Task completed"})

    if message_type == "error":
        message = body.get("message")
        if not isinstance(message, str):
            return json_body({"message": "error.message must be a string"}, 400)
        _mark_error(task_id, message)
        return json_body({"message": "Task failed"})

    return json_body({"message": f"Ignored unknown type: {message_type}"})
