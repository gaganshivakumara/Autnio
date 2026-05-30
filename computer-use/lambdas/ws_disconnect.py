from __future__ import annotations

from typing import Any

from common import connections_table, json_body


def _resolve_user_id(connection_id: str) -> str | None:
    table = connections_table()
    result = table.scan(
        FilterExpression="connectionId = :cid",
        ExpressionAttributeValues={":cid": connection_id},
        Limit=1,
    )
    items = result.get("Items", [])
    if not items:
        return None
    return items[0].get("userId")


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    request_context = event.get("requestContext", {})
    connection_id = request_context.get("connectionId")
    if not connection_id:
        return json_body({"message": "Missing connection ID"}, 400)

    user_id = _resolve_user_id(connection_id)
    if not user_id:
        return json_body({"message": "Connection not found"})

    connections_table().delete_item(Key={"userId": user_id})
    return json_body({"message": "Disconnected"})
