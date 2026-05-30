import json
import os

import boto3

lambda_client = boto3.client("lambda")

QWEN_FUNCTION = os.environ["QWEN_FUNCTION_NAME"]
NEMOTRON_FUNCTION = os.environ["NEMOTRON_FUNCTION_NAME"]


def handler(event, context):
    body = json.loads(event.get("body") or "{}")
    mode = body.get("mode", "detect")
    s3_key = body.get("imageS3Key", "")

    if not s3_key:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "imageS3Key is required"}),
        }

    target = NEMOTRON_FUNCTION if mode == "stream" else QWEN_FUNCTION
    response = lambda_client.invoke(
        FunctionName=target,
        InvocationType="RequestResponse",
        Payload=json.dumps({"body": json.dumps(body)}),
    )
    payload = json.loads(response["Payload"].read())
    return payload
