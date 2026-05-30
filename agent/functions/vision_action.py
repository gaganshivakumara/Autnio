from __future__ import annotations

import json
import os

import boto3

from bedrock_util import agent_response, parse_body

lambda_client = boto3.client("lambda")
ROUTER_FUNCTION = os.environ.get("ROUTER_FUNCTION_NAME", "autnio-dev-vision-router")


def handler(event, context):
    body = parse_body(event)
    mode = body.get("mode", "detect")
    s3_key = body.get("imageS3Key", "")
    prompt = body.get("prompt", "Describe the scene")

    if not s3_key:
        return agent_response(event, 400, {"message": "imageS3Key is required", "data": {}})

    payload = {
        "body": json.dumps(
            {
                "mode": mode,
                "imageS3Key": s3_key,
                "prompt": prompt,
            }
        )
    }
    try:
        response = lambda_client.invoke(
            FunctionName=ROUTER_FUNCTION,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload),
        )
        result = json.loads(response["Payload"].read())
    except Exception as exc:  # noqa: BLE001
        return agent_response(
            event,
            200,
            {"result": "Vision router error", "message": str(exc), "data": {}},
        )

    if result.get("statusCode") != 200:
        return agent_response(
            event,
            result.get("statusCode", 500),
            json.loads(result.get("body") or "{}"),
        )

    body_data = json.loads(result.get("body") or "{}")
    return agent_response(event, 200, body_data)
