"""
Anthropic Computer Use loop — implemented with custom JSON-schema tools
so it works on AWS Bedrock invoke_model with any Claude model (no beta flags,
no special tool types required).

The loop is semantically identical to the built-in computer use tools:
  1. Call Bedrock with task + tool definitions
  2. Claude responds with tool_use blocks (screenshot / click / type / bash…)
  3. We execute locally (pyautogui / subprocess)
  4. Send the result (including base64 screenshots) back as tool_result
  5. Repeat until Claude returns end_turn with a text summary
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
from typing import Any, Generator

import boto3

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_MODEL = os.environ.get("BEDROCK_MODEL", "us.anthropic.claude-sonnet-4-6")
DEFAULT_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "4096"))
MAX_ITERATIONS = 50

SYSTEM_PROMPT = (
    "You are an automation agent running on the user's local macOS machine. "
    "Tasks are dispatched remotely. Execute the task efficiently using the "
    "available tools: screenshot, click, double_click, right_click, type_text, "
    "key_press, scroll, run_bash, and read_file / write_file for file operations. "
    "Always start by taking a screenshot to understand the current screen state. "
    "After each significant action take another screenshot to confirm results. "
    "When finished, provide a brief summary of what you accomplished."
)

# ── Bedrock client ─────────────────────────────────────────────────────────────

def make_bedrock_client(region: str = DEFAULT_REGION) -> Any:
    return boto3.client("bedrock-runtime", region_name=region)


# ── Custom tool definitions ────────────────────────────────────────────────────
# These replace the special computer_20241022 / bash_20241022 tool types.
# Standard JSON-schema tools work with every Claude model on Bedrock.

TOOLS: list[dict] = [
    {
        "name": "screenshot",
        "description": (
            "Capture the current state of the screen and return it as a base64 PNG image. "
            "Always call this first before deciding what to click or type."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "click",
        "description": "Click the mouse at the given screen coordinates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "X coordinate in pixels"},
                "y": {"type": "integer", "description": "Y coordinate in pixels"},
                "button": {
                    "type": "string",
                    "enum": ["left", "right", "middle", "double"],
                    "description": "Mouse button (default: left)",
                },
            },
            "required": ["x", "y"],
        },
    },
    {
        "name": "type_text",
        "description": "Type text at the current cursor position using the keyboard.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to type"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "key_press",
        "description": (
            "Press a key or key combination. "
            "Examples: 'Return', 'Escape', 'Tab', 'ctrl+c', 'cmd+space', 'ctrl+a'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keys": {"type": "string", "description": "Key or key combo to press"},
            },
            "required": ["keys"],
        },
    },
    {
        "name": "scroll",
        "description": "Scroll the mouse wheel at the given coordinates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer"},
                "y": {"type": "integer"},
                "direction": {
                    "type": "string",
                    "enum": ["up", "down", "left", "right"],
                },
                "amount": {
                    "type": "integer",
                    "description": "Number of scroll steps (default: 3)",
                },
            },
            "required": ["x", "y", "direction"],
        },
    },
    {
        "name": "drag",
        "description": "Click and drag from start to end coordinates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_x": {"type": "integer"},
                "start_y": {"type": "integer"},
                "end_x": {"type": "integer"},
                "end_y": {"type": "integer"},
            },
            "required": ["start_x", "start_y", "end_x", "end_y"],
        },
    },
    {
        "name": "run_bash",
        "description": (
            "Run a shell command on the local macOS machine and return stdout + stderr. "
            "Use for file operations, launching apps (open -a AppName), "
            "web requests (curl), or anything faster done in the terminal."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to run"},
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a local file and return it as text.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute file path"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write text content to a local file (overwrites if exists).",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute file path"},
                "content": {"type": "string", "description": "Content to write"},
            },
            "required": ["path", "content"],
        },
    },
]


# ── Bedrock invocation ─────────────────────────────────────────────────────────

def invoke_bedrock(
    client: Any,
    model_id: str,
    messages: list[dict],
    system: str = SYSTEM_PROMPT,
) -> dict:
    body: dict = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TOKENS,
        "system": system,
        "tools": TOOLS,
        "messages": messages,
    }
    response = client.invoke_model(
        modelId=model_id,
        body=json.dumps(body),
    )
    return json.loads(response["body"].read())


# ── Tool execution ─────────────────────────────────────────────────────────────

def _take_screenshot() -> str:
    """Return a base64-encoded PNG of the current screen."""
    import pyautogui  # type: ignore[import]
    img = pyautogui.screenshot()
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode()


def _screenshot_content() -> list[dict]:
    b64 = _take_screenshot()
    return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}}]


def _ok() -> list[dict]:
    return [{"type": "text", "text": "OK"}]


def _err(msg: str) -> list[dict]:
    return [{"type": "text", "text": f"Error: {msg}"}]


def execute_tool(tool_name: str, tool_input: dict) -> tuple[list[dict], bool]:
    """Execute a tool locally and return (content_list, is_error)."""
    try:
        import pyautogui  # type: ignore[import]

        if tool_name == "screenshot":
            return _screenshot_content(), False

        if tool_name == "click":
            x, y = tool_input["x"], tool_input["y"]
            button = tool_input.get("button", "left")
            if button == "double":
                pyautogui.doubleClick(x, y)
            elif button == "right":
                pyautogui.rightClick(x, y)
            elif button == "middle":
                pyautogui.middleClick(x, y)
            else:
                pyautogui.click(x, y)
            return _ok(), False

        if tool_name == "type_text":
            text = tool_input.get("text", "")
            try:
                import pyperclip  # type: ignore[import]
                pyperclip.copy(text)
                pyautogui.hotkey("command", "v")
            except ImportError:
                pyautogui.write(text, interval=0.03)
            return _ok(), False

        if tool_name == "key_press":
            keys_str = tool_input.get("keys", "")
            parts = [k.strip() for k in keys_str.replace("+", " ").split() if k.strip()]
            if len(parts) == 1:
                pyautogui.press(parts[0])
            else:
                pyautogui.hotkey(*parts)
            return _ok(), False

        if tool_name == "scroll":
            x, y = tool_input["x"], tool_input["y"]
            direction = tool_input.get("direction", "down")
            amount = int(tool_input.get("amount", 3))
            clicks = amount if direction in ("up", "left") else -amount
            pyautogui.scroll(clicks, x=x, y=y)
            return _ok(), False

        if tool_name == "drag":
            pyautogui.mouseDown(tool_input["start_x"], tool_input["start_y"])
            pyautogui.moveTo(tool_input["end_x"], tool_input["end_y"], duration=0.4)
            pyautogui.mouseUp()
            return _ok(), False

        if tool_name == "run_bash":
            result = subprocess.run(
                tool_input.get("command", ""),
                shell=True, capture_output=True, text=True, timeout=60,
            )
            output = result.stdout + (f"\nSTDERR:\n{result.stderr}" if result.stderr else "")
            return [{"type": "text", "text": output or "(no output)"}], False

        if tool_name == "read_file":
            with open(tool_input["path"]) as f:
                return [{"type": "text", "text": f.read()}], False

        if tool_name == "write_file":
            with open(tool_input["path"], "w") as f:
                f.write(tool_input.get("content", ""))
            return _ok(), False

        return _err(f"Unknown tool: {tool_name}"), True

    except subprocess.TimeoutExpired:
        return _err("Command timed out after 60s"), True
    except Exception as exc:
        return _err(str(exc)), True


def describe_action(tool_name: str, tool_input: dict) -> str:
    if tool_name == "screenshot":
        return "[screenshot]"
    if tool_name == "click":
        btn = tool_input.get("button", "left")
        return f"[{btn}_click] ({tool_input.get('x')}, {tool_input.get('y')})"
    if tool_name == "type_text":
        t = tool_input.get("text", "")
        preview = t[:50] + "…" if len(t) > 50 else t
        return f"[type] {preview!r}"
    if tool_name == "key_press":
        return f"[key] {tool_input.get('keys', '')}"
    if tool_name == "scroll":
        return f"[scroll {tool_input.get('direction','')}] ({tool_input.get('x')},{tool_input.get('y')})"
    if tool_name == "drag":
        return f"[drag] ({tool_input.get('start_x')},{tool_input.get('start_y')}) → ({tool_input.get('end_x')},{tool_input.get('end_y')})"
    if tool_name == "run_bash":
        cmd = tool_input.get("command", "")
        return f"[bash] {cmd[:60]}{'…' if len(cmd) > 60 else ''}"
    if tool_name == "read_file":
        return f"[read_file] {tool_input.get('path','')}"
    if tool_name == "write_file":
        return f"[write_file] {tool_input.get('path','')}"
    return f"[{tool_name}]"


# ── Main agentic loop ──────────────────────────────────────────────────────────

def run_computer_use_loop(
    task: str,
    client: Any,
    model_id: str = DEFAULT_MODEL,
) -> Generator[tuple[str, str], None, None]:
    """
    Drive the computer use agentic loop against AWS Bedrock.

    Uses standard custom JSON-schema tools (no special computer_20241022 types),
    so it works with any Claude model on Bedrock via invoke_model.

    Yields (event_type, data):
      ("output", "human-readable action description or Claude text")
      ("done",   "final summary")
      ("error",  "error message")
    """
    messages: list[dict] = [{"role": "user", "content": task}]
    collected_text: list[str] = []

    for _iteration in range(MAX_ITERATIONS):
        try:
            response = invoke_bedrock(client, model_id, messages)
        except Exception as exc:
            yield ("error", f"Bedrock error: {exc}")
            return

        stop_reason = response.get("stop_reason")
        content = response.get("content", [])

        text_parts = [b["text"] for b in content if b.get("type") == "text" and b.get("text")]
        tool_uses = [b for b in content if b.get("type") == "tool_use"]

        if text_parts:
            text = "\n".join(text_parts)
            collected_text.append(text)
            yield ("output", text)

        if stop_reason == "end_turn" or not tool_uses:
            result = "\n".join(collected_text) if collected_text else "Task complete."
            yield ("done", result)
            return

        messages.append({"role": "assistant", "content": content})

        tool_results: list[dict] = []
        for tool_use in tool_uses:
            tool_name = tool_use.get("name", "")
            tool_input = tool_use.get("input", {})
            tool_use_id = tool_use.get("id", "")

            desc = describe_action(tool_name, tool_input)
            yield ("output", desc)

            content_list, is_error = execute_tool(tool_name, tool_input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": content_list,
                **({"is_error": True} if is_error else {}),
            })

        messages.append({"role": "user", "content": tool_results})

    yield ("error", f"Exceeded maximum iterations ({MAX_ITERATIONS})")
