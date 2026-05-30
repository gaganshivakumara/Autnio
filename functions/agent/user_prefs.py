import os

import boto3

from bedrock_util import agent_response, parse_body

dynamodb = boto3.resource("dynamodb")
TABLE = os.environ.get("DYNAMODB_TABLE", "autnio-dev")


def handler(event, context):
    body = parse_body(event)
    user_id = body.get("userId", "")
    api_path = event.get("apiPath", "")
    table = dynamodb.Table(TABLE)

    if api_path == "/profile/get":
        resp = table.get_item(Key={"userId": user_id})
        item = resp.get("Item", {"userId": user_id, "preferences": {}})
        return agent_response(event, 200, {"result": "Profile loaded", "data": item})

    if api_path == "/profile/update":
        table.put_item(
            Item={
                "userId": user_id,
                "preferences": body.get("preferences", {}),
            }
        )
        return agent_response(event, 200, {"result": "Profile updated", "data": {}})

    if api_path == "/task/log":
        return agent_response(
            event,
            200,
            {
                "result": "Task logged",
                "data": {"userId": user_id, "task": body.get("task", ""), "status": "logged"},
            },
        )

    return agent_response(event, 400, {"message": f"Unknown path {api_path}", "data": {}})
