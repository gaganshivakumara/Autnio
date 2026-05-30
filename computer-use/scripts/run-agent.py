#!/usr/bin/env python3
"""
Autnio Computer Agent — Anthropic Computer Use via AWS Bedrock

Replaces Open Interpreter. Uses Claude's native computer use tools
(computer + bash) running entirely on Bedrock, no local LLM server needed.

Usage:
    .venv/bin/python computer-use/scripts/run-agent.py
"""
from __future__ import annotations

import asyncio
import json
import os
import pathlib
import random
import signal
import string
import subprocess
import sys
import time
from io import BytesIO

import boto3
import pyautogui
from PIL import Image

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = pathlib.Path(__file__).parent.resolve()
CODE_FILE    = pathlib.Path.home() / ".autnio_agent_code"
WS_ENDPOINT  = os.environ.get("VITE_WS_API_URL", "wss://3cil79jtm9.execute-api.us-east-1.amazonaws.com/dev")
MODEL_ID     = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
MAX_STEPS    = 30
RECONNECT_DELAY = 5

# ── Bedrock client ────────────────────────────────────────────────────────────
bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
)

# ── Tool definitions ──────────────────────────────────────────────────────────
SCREEN_W, SCREEN_H = pyautogui.size()

TOOLS = [
    {
        "toolSpec": {
            "name": "computer",
            "description": (
                f"Control the macOS computer (screen {SCREEN_W}x{SCREEN_H}px). "
                "Take screenshots, click, type, press keys, scroll."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": [
                                "screenshot", "left_click", "right_click", "double_click",
                                "type", "key", "scroll", "move_mouse", "cursor_position",
                            ],
                        },
                        "coordinate": {
                            "type": "array", "items": {"type": "integer"},
                            "description": "[x, y] pixel coordinate",
                        },
                        "text":      {"type": "string"},
                        "direction": {"type": "string", "enum": ["up", "down", "left", "right"]},
                        "amount":    {"type": "integer", "description": "scroll clicks"},
                    },
                    "required": ["action"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "bash",
            "description": "Execute a bash command on the local machine and return stdout+stderr.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                }
            },
        }
    },
]

SYSTEM_PROMPT = f"""You are Autnio, an autonomous computer-use agent on macOS (screen: {SCREEN_W}×{SCREEN_H}px).

Work in a strict PLAN → APPLY → VERIFY loop until the goal is fully achieved:

PLAN
• Before acting, think through the goal and list every concrete step.
• State any assumptions you make up front.

APPLY
• Execute ONE logical action per turn.
• Prefer bash for: opening URLs (`open https://…`), file ops, running scripts.
• Prefer computer tools for: GUI clicks, typing, scrolling, reading the screen.

VERIFY
• After every non-screenshot action, immediately call screenshot to confirm the result.
• If the screen is not in the expected state, adapt your plan and continue.
• Never declare success without a final screenshot that confirms the goal is met.

LOOP
• Repeat APPLY → VERIFY until every step is complete (max {MAX_STEPS} tool calls).
• If you hit the cap, summarise your progress clearly.

COMPLETION
• End with a concise summary: what you did, what you found, any issues.
• Include concrete data from the screen (URLs, text, prices, headlines) in the summary."""

# ── Tool execution ────────────────────────────────────────────────────────────
def _screenshot_result() -> dict:
    """Take a screenshot and return a Bedrock image content block."""
    img = pyautogui.screenshot()
    if img.width > 1280:
        ratio = 1280 / img.width
        img = img.resize((1280, int(img.height * ratio)), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return {"bytes": buf.getvalue(), "format": "png"}


def execute_computer(inp: dict) -> dict:
    """Run a computer tool action, return dict with type='image' or type='text'."""
    action = inp.get("action", "")
    coord  = inp.get("coordinate", [0, 0])
    text   = inp.get("text", "")

    if action == "screenshot":
        r = _screenshot_result()
        return {"type": "image", **r}

    elif action == "left_click":
        pyautogui.click(coord[0], coord[1])
        return {"type": "text", "text": f"Clicked ({coord[0]}, {coord[1]})"}

    elif action == "right_click":
        pyautogui.rightClick(coord[0], coord[1])
        return {"type": "text", "text": f"Right-clicked ({coord[0]}, {coord[1]})"}

    elif action == "double_click":
        pyautogui.doubleClick(coord[0], coord[1])
        return {"type": "text", "text": f"Double-clicked ({coord[0]}, {coord[1]})"}

    elif action == "move_mouse":
        pyautogui.moveTo(coord[0], coord[1])
        return {"type": "text", "text": f"Moved to ({coord[0]}, {coord[1]})"}

    elif action == "type":
        pyautogui.write(text, interval=0.03)
        return {"type": "text", "text": f"Typed: {text[:80]}"}

    elif action == "key":
        keys = text.split("+")
        if len(keys) > 1:
            pyautogui.hotkey(*keys)
        else:
            pyautogui.press(text)
        return {"type": "text", "text": f"Key: {text}"}

    elif action == "scroll":
        direction = inp.get("direction", "down")
        amount    = inp.get("amount", 3)
        x, y = coord if len(coord) >= 2 else pyautogui.position()
        delta = amount if direction in ("up", "right") else -amount
        pyautogui.scroll(delta, x=x, y=y)
        return {"type": "text", "text": f"Scrolled {direction} {amount}x"}

    elif action == "cursor_position":
        x, y = pyautogui.position()
        return {"type": "text", "text": f"Cursor at ({x}, {y})"}

    return {"type": "text", "text": f"Unknown action: {action}"}


def execute_bash(command: str) -> str:
    try:
        r = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        out = r.stdout or ""
        if r.stderr:
            out += f"\n[stderr] {r.stderr[:500]}"
        return out.strip() or "(no output)"
    except subprocess.TimeoutExpired:
        return "Timed out after 30s"
    except Exception as e:
        return f"Error: {e}"


# ── Bedrock message builders ──────────────────────────────────────────────────
def _tool_result_block(tool_use_id: str, result: dict) -> dict:
    """Return a single toolResult content block (NOT a full message)."""
    if result["type"] == "image":
        content = [{"image": {"format": result["format"], "source": {"bytes": result["bytes"]}}}]
    else:
        content = [{"text": result.get("text", "")}]
    return {"toolResult": {"toolUseId": tool_use_id, "content": content}}


# ── Main agentic loop ─────────────────────────────────────────────────────────
def run_task(task: str, on_output) -> str:
    """
    Plan → Apply → Verify loop via Bedrock converse.
    Calls on_output(str) with live progress chunks.
    """
    messages: list[dict] = [{"role": "user", "content": [{"text": task}]}]
    all_text: list[str] = []

    for step in range(MAX_STEPS):
        resp = bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": SYSTEM_PROMPT}],
            messages=messages,
            toolConfig={"tools": TOOLS},
            inferenceConfig={"maxTokens": 4096, "temperature": 0.3},
        )

        out_msg     = resp["output"]["message"]
        stop_reason = resp["stopReason"]
        content     = out_msg.get("content", [])

        text_parts = [b["text"] for b in content if "text" in b]
        tool_uses  = [b["toolUse"]  for b in content if "toolUse" in b]

        if text_parts:
            chunk = "\n".join(text_parts)
            all_text.append(chunk)
            on_output(chunk)

        if stop_reason == "end_turn" or not tool_uses:
            break

        # Keep assistant turn in history before executing tools
        messages.append(out_msg)

        # Execute all tools, then batch ALL results into ONE user message.
        # The Bedrock converse API requires a single user message containing
        # every toolResult block — separate messages cause validation errors.
        tool_result_blocks: list[dict] = []
        for tu in tool_uses:
            name    = tu["name"]
            inp     = tu["input"]
            tool_id = tu["toolUseId"]

            label = f"[{name}:{inp.get('action', inp.get('command', '')[:40])}]"
            on_output(label)
            print(f"  {label}", flush=True)

            if name == "computer":
                result = execute_computer(inp)
            elif name == "bash":
                cmd_out = execute_bash(inp.get("command", ""))
                print(f"  → {cmd_out[:200]}", flush=True)
                result = {"type": "text", "text": cmd_out}
            else:
                result = {"type": "text", "text": f"unknown tool: {name}"}

            tool_result_blocks.append(_tool_result_block(tool_id, result))

        # Single batched user message with all tool results
        messages.append({"role": "user", "content": tool_result_blocks})

    return "\n".join(all_text)


# ── Access code ───────────────────────────────────────────────────────────────
def get_or_create_code() -> str:
    if CODE_FILE.exists():
        code = CODE_FILE.read_text().strip()
        if code:
            return code
    code = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    CODE_FILE.write_text(code)
    return code


# ── WebSocket relay loop ──────────────────────────────────────────────────────
async def relay_loop(code: str) -> None:
    try:
        import websockets  # type: ignore[import]
    except ImportError:
        print("ERROR: pip install websockets", file=sys.stderr)
        sys.exit(1)

    url     = f"{WS_ENDPOINT}?token={code}"
    attempt = 0
    loop    = asyncio.get_event_loop()

    while True:
        attempt += 1
        try:
            print(f"  Connecting… (attempt {attempt})", flush=True)
            async with websockets.connect(url) as ws:
                attempt = 0
                print("  Relay connected ✓\n", flush=True)

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except Exception:
                        continue
                    if msg.get("type") != "task":
                        continue

                    task_id    = msg.get("taskId") or f"t-{int(time.time())}"
                    session_id = msg.get("sessionId")
                    task       = msg.get("task", "")

                    print(f"\n── Task ────────────────────────────────\n{task}\n", flush=True)

                    output_chunks: list[str] = []

                    def on_output(chunk: str) -> None:
                        output_chunks.append(chunk)
                        print(chunk, end="", flush=True)
                        # Fire-and-forget send over WS
                        asyncio.run_coroutine_threadsafe(
                            ws.send(json.dumps({
                                "type": "output",
                                "taskId": task_id,
                                "sessionId": session_id,
                                "data": chunk,
                            })),
                            loop,
                        )

                    try:
                        result = await loop.run_in_executor(None, run_task, task, on_output)
                        print(f"\n  ✓ done", flush=True)
                        await ws.send(json.dumps({
                            "type": "done",
                            "taskId": task_id,
                            "sessionId": session_id,
                            "result": result or None,
                        }))
                    except Exception as exc:
                        msg_err = str(exc)
                        print(f"\n  ✗ {msg_err}", flush=True)
                        await ws.send(json.dumps({
                            "type": "error",
                            "taskId": task_id,
                            "sessionId": session_id,
                            "message": msg_err,
                        }))

        except Exception as exc:
            delay = min(RECONNECT_DELAY * attempt, 60)
            print(f"  Disconnected ({exc}). Retry in {delay}s…", flush=True)
            await asyncio.sleep(delay)


# ── Local voice loop ──────────────────────────────────────────────────────────
async def voice_loop() -> None:
    """
    Continuously listen on the local microphone, send transcripts through the
    same agentic loop as WebSocket tasks, and speak responses back via Polly.
    Runs as a concurrent asyncio task alongside relay_loop.
    """
    try:
        from voice import listen, speak  # type: ignore[import]
    except ImportError:
        print("  Voice deps not installed — local voice disabled.", flush=True)
        return

    print("  🎙  Local voice mode active (speak to send tasks directly)\n", flush=True)
    loop = asyncio.get_event_loop()

    while True:
        try:
            # Run blocking mic capture in thread pool so relay can still receive WS msgs
            transcript = await loop.run_in_executor(None, listen)
            if not transcript:
                continue

            print(f"\n── Voice task ──────────────────────────────\n{transcript}\n", flush=True)
            output_chunks: list[str] = []

            def _on_output(chunk: str) -> None:
                output_chunks.append(chunk)
                print(chunk, end="", flush=True)

            result = await loop.run_in_executor(None, run_task, transcript, _on_output)
            print(f"\n  ✓ done", flush=True)

            # Speak the final response
            if result.strip():
                await loop.run_in_executor(None, speak, result)

        except Exception as exc:
            print(f"  Voice loop error: {exc}", flush=True)
            await asyncio.sleep(1)


async def _main_async(code: str) -> None:
    """Run relay + voice concurrently."""
    await asyncio.gather(
        relay_loop(code),
        voice_loop(),
    )


# ── Entry point ───────────────────────────────────────────────────────────────
def main() -> None:
    code = get_or_create_code()

    print("\n" + "═" * 52, flush=True)
    print("  Autnio Computer Agent  [Anthropic Computer Use]", flush=True)
    print("═" * 52, flush=True)
    print(f"\n  Access code:  {code.upper()}", flush=True)
    print(f"\n  Open this URL to pair instantly:", flush=True)
    print(f"  https://d31acxjmxxrvao.cloudfront.net/#/app?code={code}", flush=True)
    print(f"\n  Model: {MODEL_ID}", flush=True)
    print(f"  Screen: {SCREEN_W}x{SCREEN_H}px\n", flush=True)
    print("═" * 52 + "\n", flush=True)

    def _shutdown(sig: int, _frame) -> None:
        print("\n  Shutting down…", flush=True)
        sys.exit(0)
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    asyncio.run(_main_async(code))


if __name__ == "__main__":
    main()
