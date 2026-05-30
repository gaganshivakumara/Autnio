import asyncio
import base64
import json
import os

from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

REGION = os.environ.get("AWS_REGION", "us-east-1")

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


class TranscriptHandler(TranscriptResultStreamHandler):
    def __init__(self, stream, results: list[str]):
        super().__init__(stream)
        self.results = results

    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        for result in transcript_event.transcript.results:
            if not result.is_partial and result.alternatives:
                transcript = result.alternatives[0].transcript
                if transcript:
                    self.results.append(transcript)


def response(status_code: int, payload: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps(payload),
    }


async def transcribe_audio(
    audio_bytes: bytes,
    language_code: str = "en-US",
    media_sample_rate_hz: int = 16000,
    media_encoding: str = "pcm",
) -> str:
    client = TranscribeStreamingClient(region=REGION)
    stream = await client.start_stream_transcription(
        language_code=language_code,
        media_sample_rate_hz=media_sample_rate_hz,
        media_encoding=media_encoding,
    )

    results: list[str] = []
    handler = TranscriptHandler(stream.output_stream, results)

    async def write_chunks():
        chunk_size = 1024 * 8
        for idx in range(0, len(audio_bytes), chunk_size):
            await stream.input_stream.send_audio_event(audio_chunk=audio_bytes[idx : idx + chunk_size])
        await stream.input_stream.end_stream()

    await asyncio.gather(write_chunks(), handler.handle_events())
    return " ".join(results)


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(200, {})

    try:
        body = json.loads(event.get("body") or "{}")
        audio_base64 = body.get("audioBase64", "")
        if not audio_base64:
            return response(400, {"message": "No audio provided"})

        audio_bytes = base64.b64decode(audio_base64)
        transcript = asyncio.run(
            transcribe_audio(
                audio_bytes,
                language_code=body.get("languageCode", "en-US"),
                media_sample_rate_hz=int(body.get("mediaSampleRateHz", 16000)),
                media_encoding=body.get("mediaEncoding", "pcm"),
            )
        )

        if not transcript.strip():
            return response(400, {"message": "No speech detected"})

        return response(200, {"result": transcript, "data": {"transcript": transcript}})
    except Exception as exc:
        return response(500, {"message": str(exc)})
