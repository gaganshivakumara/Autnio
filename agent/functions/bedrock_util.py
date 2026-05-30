import json


def parse_body(event: dict) -> dict:
    body = {}
    request_body = event.get("requestBody") or {}
    content = request_body.get("content") or {}
    json_content = content.get("application/json") or {}
    for prop in json_content.get("properties") or []:
        name = prop.get("name")
        if name is not None and "value" in prop:
            body[name] = prop["value"]
    for param in event.get("parameters") or []:
        name = param.get("name")
        if name is not None and "value" in param:
            body[name] = param["value"]
    return body


def agent_response(event: dict, status_code: int, payload: dict) -> dict:
    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": event.get("actionGroup", ""),
            "apiPath": event.get("apiPath", ""),
            "httpMethod": event.get("httpMethod", "POST"),
            "httpStatusCode": status_code,
            "responseBody": {
                "application/json": {"body": json.dumps(payload)}
            },
        },
    }
