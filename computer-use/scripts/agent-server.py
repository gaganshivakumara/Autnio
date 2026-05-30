#!/usr/bin/env python3
"""
Autnio Computer Use Agent Server.

A lightweight FastAPI server that runs the Anthropic Computer Use agentic loop
and streams results as NDJSON. This is the local HTTP target for OIRelay.ts
(browser relay path) — it replaces the old Open Interpreter server on :8000.

Usage:
    python computer-use/scripts/agent-server.py
    # or
    uvicorn agent-server:app --host 127.0.0.1 --port 8001

Required env vars:
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
    BEDROCK_MODEL  (default: us.anthropic.claude-sonnet-4-6)

Endpoint:
    POST /computer-use   { "task": "..." }
    → streams NDJSON:
        {"type":"output","data":"[screenshot]"}
        {"type":"output","data":"Clicking at [100, 200]"}
        {"type":"done","result":"Task complete."}
    → or on error:
        {"type":"error","message":"..."}
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import queue
import threading
from typing import Any, AsyncGenerator

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Autnio Computer Use Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

MODEL_ID = os.environ.get("BEDROCK_MODEL", "us.anthropic.claude-sonnet-4-6")

# ── Singleton Bedrock client ──────────────────────────────────────────────────
_bedrock_client: Any = None


def get_bedrock_client() -> Any:
    global _bedrock_client
    if _bedrock_client is None:
        from computer_use_core import make_bedrock_client  # noqa: PLC0415
        _bedrock_client = make_bedrock_client()
    return _bedrock_client


# ── Streaming NDJSON generator ────────────────────────────────────────────────

async def _stream_computer_use(task: str) -> AsyncGenerator[str, None]:
    """
    Run the computer use loop in a background thread and yield NDJSON lines
    as events arrive.
    """
    from computer_use_core import run_computer_use_loop  # noqa: PLC0415

    event_queue: queue.Queue[tuple[str, str] | None] = queue.Queue()
    loop = asyncio.get_running_loop()

        def _run_in_thread() -> None:
            try:
                client = get_bedrock_client()
                for event in run_computer_use_loop(task, client, MODEL_ID):
                loop.call_soon_threadsafe(event_queue.put_nowait, event)
        except Exception as exc:
            loop.call_soon_threadsafe(event_queue.put_nowait, ("error", str(exc)))
        finally:
            loop.call_soon_threadsafe(event_queue.put_nowait, None)

    threading.Thread(target=_run_in_thread, daemon=True).start()

    while True:
        try:
            item = event_queue.get_nowait()
        except queue.Empty:
            await asyncio.sleep(0.05)
            continue

        if item is None:
            break

        event_type, data = item
        log.info("[%s] %s", event_type, data[:80] if len(data) > 80 else data)

        if event_type == "output":
            yield json.dumps({"type": "output", "data": data}) + "\n"
        elif event_type == "done":
            yield json.dumps({"type": "done", "result": data}) + "\n"
            break
        elif event_type == "error":
            yield json.dumps({"type": "error", "message": data}) + "\n"
            break


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/computer-use")
async def computer_use(request: Request) -> StreamingResponse:
    body = await request.json()
    task: str = body.get("task", "").strip()
    if not task:
        return StreamingResponse(
            iter([json.dumps({"type": "error", "message": "task is required"}) + "\n"]),
            media_type="application/x-ndjson",
        )
    log.info("Task: %s", task[:120])
    return StreamingResponse(
        _stream_computer_use(task),
        media_type="application/x-ndjson",
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": MODEL_ID}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("AGENT_SERVER_PORT", "8001"))
    log.info("Starting Autnio Computer Use Agent Server on port %d", port)
    log.info("Model: %s", MODEL_ID)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
