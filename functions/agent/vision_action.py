import json
import os

import boto3

from bedrock_util import agent_response, parse_body

lambda_client = boto3.client("lambda")
ROUTER_FUNCTION = os.environ["ROUTER_FUNCTION_NAME"]


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
    response = lambda_client.invoke(
        FunctionName=ROUTER_FUNCTION,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload),
    )
    result = json.loads(response["Payload"].read())
    if result.get("statusCode") != 200:
        return agent_response(
            event,
            result.get("statusCode", 500),
            json.loads(result.get("body") or "{}"),
        )

    body_data = json.loads(result.get("body") or "{}")
    return agent_response(event, 200, body_data)
