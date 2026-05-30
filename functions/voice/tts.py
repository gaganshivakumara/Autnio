import base64
import json
import os

import boto3

polly = boto3.client("polly", region_name=os.environ.get("AWS_REGION", "us-east-1"))

VOICE_ID = os.environ.get("POLLY_VOICE_ID", "Joanna")
ENGINE = os.environ.get("POLLY_ENGINE", "neural")

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


def response(status_code: int, payload: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps(payload),
    }


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(200, {})

    try:
        body = json.loads(event.get("body") or "{}")
        text = body.get("text", "")

        if not text.strip():
            return response(400, {"message": "No text provided"})

        synth = polly.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=body.get("voiceId", VOICE_ID),
            Engine=body.get("engine", ENGINE),
        )
        audio_bytes = synth["AudioStream"].read()

        return response(
            200,
            {
                "result": "Audio synthesized",
                "data": {
                    "audioBase64": base64.b64encode(audio_bytes).decode("utf-8"),
                    "contentType": "audio/mpeg",
                    "voiceId": body.get("voiceId", VOICE_ID),
                    "engine": body.get("engine", ENGINE),
                },
            },
        )
    except Exception as exc:
        return response(500, {"message": str(exc)})
