"""
Local voice I/O for the Autnio Computer Agent.

  listen() → str        Record ~5 s of mic audio, send to Amazon Transcribe,
                        return transcript (or "" if nothing heard).
  speak(text)           Synthesize text via Amazon Polly, play through speakers.

Both functions call AWS directly (boto3) — no Lambda round-trip required.
"""
from __future__ import annotations

import asyncio
import io
import os
import struct
import tempfile
from typing import Optional

import boto3
import numpy as np
import sounddevice as sd

# ── AWS clients ────────────────────────────────────────────────────────────────
REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
polly   = boto3.client("polly",   region_name=REGION)
_transcribe_region = REGION

# ── Constants ──────────────────────────────────────────────────────────────────
SAMPLE_RATE    = 16_000          # Hz — Transcribe works best at 16 kHz
RECORD_SECONDS = 5               # seconds of audio to capture per utterance
CHANNELS       = 1
POLLY_VOICE    = os.environ.get("POLLY_VOICE_ID",  "Ruth")   # neural voice
POLLY_ENGINE   = os.environ.get("POLLY_ENGINE",    "neural")


# ── Transcribe ─────────────────────────────────────────────────────────────────
async def _transcribe_bytes(pcm_bytes: bytes) -> str:
    from amazon_transcribe.client import TranscribeStreamingClient
    from amazon_transcribe.handlers import TranscriptResultStreamHandler
    from amazon_transcribe.model import TranscriptEvent

    class _Handler(TranscriptResultStreamHandler):
        def __init__(self, stream, bucket: list[str]):
            super().__init__(stream)
            self._bucket = bucket

        async def handle_transcript_event(self, event: TranscriptEvent):
            for result in event.transcript.results:
                if not result.is_partial and result.alternatives:
                    t = result.alternatives[0].transcript
                    if t:
                        self._bucket.append(t)

    client   = TranscribeStreamingClient(region=_transcribe_region)
    stream   = await client.start_stream_transcription(
        language_code="en-US",
        media_sample_rate_hz=SAMPLE_RATE,
        media_encoding="pcm",
    )
    bucket: list[str] = []
    handler  = _Handler(stream.output_stream, bucket)

    async def _send():
        chunk_size = 8 * 1024
        for i in range(0, len(pcm_bytes), chunk_size):
            await stream.input_stream.send_audio_event(audio_chunk=pcm_bytes[i:i + chunk_size])
        await stream.input_stream.end_stream()

    await asyncio.gather(_send(), handler.handle_events())
    return " ".join(bucket).strip()


def _float32_to_pcm16(samples: np.ndarray) -> bytes:
    """Convert float32 [-1, 1] → int16 little-endian bytes."""
    clipped = np.clip(samples, -1.0, 1.0)
    return (clipped * 32767).astype("<i2").tobytes()


def listen(timeout: float = RECORD_SECONDS, silence_threshold: float = 0.01) -> str:
    """
    Record audio from the default microphone for `timeout` seconds,
    return the Amazon Transcribe transcript (empty string if no speech).
    """
    print(f"  🎙  Listening for {timeout}s …", flush=True)
    audio: np.ndarray = sd.rec(
        int(timeout * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="float32",
    )
    sd.wait()

    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < silence_threshold:
        print("  (silence — skipping transcription)", flush=True)
        return ""

    pcm = _float32_to_pcm16(audio.flatten())
    try:
        transcript = asyncio.run(_transcribe_bytes(pcm))
    except Exception as exc:
        print(f"  Transcribe error: {exc}", flush=True)
        return ""

    if transcript:
        print(f'  Heard: "{transcript}"', flush=True)
    else:
        print("  (no speech detected)", flush=True)
    return transcript


# ── TTS ────────────────────────────────────────────────────────────────────────
def speak(text: str) -> None:
    """
    Synthesize `text` via Amazon Polly (neural) and play through speakers.
    Silently skips if text is empty or Polly/pygame is unavailable.
    """
    if not text.strip():
        return

    try:
        import pygame
    except ImportError:
        print("  (pygame not installed — skipping TTS)", flush=True)
        return

    try:
        resp = polly.synthesize_speech(
            Text=text[:2_900],          # Polly limit ~3000 chars
            OutputFormat="mp3",
            VoiceId=POLLY_VOICE,
            Engine=POLLY_ENGINE,
        )
        mp3_bytes = resp["AudioStream"].read()
    except Exception as exc:
        print(f"  Polly error: {exc}", flush=True)
        return

    try:
        pygame.mixer.init()
        buf = io.BytesIO(mp3_bytes)
        pygame.mixer.music.load(buf, "mp3")
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            pygame.time.wait(50)
    except Exception as exc:
        print(f"  Playback error: {exc}", flush=True)
