from bedrock_util import agent_response, parse_body


def handler(event, context):
    body = parse_body(event)
    task = body.get("task", "")
    user_id = body.get("userId", "unknown")
    return agent_response(
        event,
        503,
        {
            "result": "Open Interpreter relay not connected",
            "message": f"Cannot dispatch task for user {user_id}. WebSocket relay pending Dev 3.",
            "data": {"task": task, "status": "pending_dev3"},
        },
    )
