from bedrock_util import agent_response, parse_body


def handler(event, context):
    body = parse_body(event)
    api_path = event.get("apiPath", "")
    return agent_response(
        event,
        200,
        {
            "result": f"Box {api_path} stub — pending Dev 2 integration",
            "data": {"status": "pending_dev2", "request": body},
        },
    )
