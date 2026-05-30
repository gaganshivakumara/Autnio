#!/usr/bin/env python3
"""
Local WebSocket mock server for relay testing.

Flow:
1. Web demo connects to ws://127.0.0.1:8765
2. User clicks "Simulate Task" in demo UI
3. Server sends a protocol-compatible task message back to the same client
4. Client forwards output/done/error messages, which this server prints
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol


HOST = "127.0.0.1"
PORT = 8765


def task_message(task_id: str, task_text: str) -> dict[str, Any]:
    return {
        "type": "task",
        "taskId": task_id,
        "userId": "demo-user",
        "sessionId": "demo-session",
        "task": task_text,
    }


async def handle_client(websocket: WebSocketServerProtocol) -> None:
    print("client connected")
    try:
        async for raw in websocket:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                print("received invalid JSON:", raw)
                continue

            msg_type = payload.get("type")

            if msg_type == "simulateTask":
                incoming_task_id = payload.get("taskId")
                task_id = incoming_task_id if isinstance(incoming_task_id, str) else str(uuid.uuid4())
                task_text = payload.get("task")
                if not isinstance(task_text, str) or not task_text.strip():
                    task_text = "Say hello from Open Interpreter."
                message = task_message(task_id, task_text)
                await websocket.send(json.dumps(message))
                print("sent task:", message)
                continue

            print("received relay message:", payload)
    except websockets.ConnectionClosed:
        print("client disconnected")


async def main() -> None:
    print(f"starting local ws mock on ws://{HOST}:{PORT}")
    async with websockets.serve(handle_client, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nstopped")
