from __future__ import annotations

import os
import time

import boto3

from bedrock_util import agent_response, parse_body

dynamodb = boto3.resource("dynamodb")
TABLE = os.environ.get("DYNAMODB_TABLE", "autnio-dev")


def handler(event, context):
    body = parse_body(event)
    user_id = body.get("userId", "")
    api_path = event.get("apiPath", "")
    table = dynamodb.Table(TABLE)

    # Single-table design: PK=USER#<userId>, SK=PROFILE
    pk = f"USER#{user_id}"

    if api_path == "/profile/get":
        resp = table.get_item(Key={"PK": pk, "SK": "PROFILE"})
        item = resp.get("Item", {"PK": pk, "SK": "PROFILE", "userId": user_id, "preferences": {}})
        return agent_response(event, 200, {"result": "Profile loaded", "data": item})

    if api_path == "/profile/update":
        table.put_item(
            Item={
                "PK": pk,
                "SK": "PROFILE",
                "userId": user_id,
                "preferences": body.get("preferences", {}),
                "updatedAt": int(time.time()),
            }
        )
        return agent_response(event, 200, {"result": "Profile updated", "data": {}})

    if api_path == "/task/log":
        task = body.get("task", "")
        task_id = f"TASK#{int(time.time())}"
        table.put_item(
            Item={
                "PK": pk,
                "SK": task_id,
                "userId": user_id,
                "task": task,
                "status": "logged",
                "createdAt": int(time.time()),
            }
        )
        return agent_response(
            event,
            200,
            {"result": "Task logged", "data": {"userId": user_id, "task": task, "status": "logged"}},
        )

    return agent_response(event, 400, {"message": f"Unknown path {api_path}", "data": {}})
