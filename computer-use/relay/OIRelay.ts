import type {
  RelayEvent,
  RelayInboundTask,
  RelayOptions,
  RelayOutboundDone,
  RelayOutboundError,
  RelayOutboundOutput,
} from "./types";

const DEFAULT_AGENT_ENDPOINT = "http://localhost:8001/computer-use";

function safeEmit(onEvent: RelayOptions["onEvent"], event: RelayEvent): void {
  if (!onEvent) return;
  onEvent(event);
}

function randomTaskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}`;
}

/** Parse one NDJSON line from the agent server stream. */
function parseNdjsonLine(
  line: string
): { type: string; data?: string; result?: string; message?: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as {
      type: string;
      data?: string;
      result?: string;
      message?: string;
    };
  } catch {
    return null;
  }
}

export class OIRelay {
  private ws: WebSocket | null = null;
  private readonly options: RelayOptions;
  private _manualDisconnect = false;
  private _reconnectAttempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RelayOptions) {
    this.options = options;
  }

  connect(): void {
    this._manualDisconnect = false;
    this._cancelReconnect();
    safeEmit(this.options.onEvent, { type: "status", status: "connecting" });
    const url = `${this.options.wsEndpoint}?token=${encodeURIComponent(this.options.idToken)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._reconnectAttempt = 0;
      safeEmit(this.options.onEvent, { type: "status", status: "connected" });
      safeEmit(this.options.onEvent, { type: "log", message: "WebSocket connected" });
    };

    this.ws.onclose = () => {
      if (this._manualDisconnect) {
        safeEmit(this.options.onEvent, { type: "status", status: "closed" });
        safeEmit(this.options.onEvent, { type: "log", message: "WebSocket closed" });
      } else {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      safeEmit(this.options.onEvent, { type: "log", message: "WebSocket error" });
      // onclose always fires after onerror — reconnect is handled there.
    };

    this.ws.onmessage = async (event: MessageEvent<string>) => {
      let message: unknown;
      try {
        message = JSON.parse(event.data);
      } catch {
        safeEmit(this.options.onEvent, {
          type: "log",
          message: `Ignored invalid JSON message: ${event.data}`,
        });
        return;
      }

      if (!this.isTaskMessage(message)) {
        safeEmit(this.options.onEvent, {
          type: "log",
          message: "Ignored non-task WebSocket message",
        });
        return;
      }

      await this.handleTask(message);
    };
  }

  disconnect(): void {
    this._manualDisconnect = true;
    this._cancelReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private _cancelReconnect(): void {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _scheduleReconnect(): void {
    if (this.options.reconnect === false) {
      safeEmit(this.options.onEvent, { type: "status", status: "closed" });
      safeEmit(this.options.onEvent, {
        type: "log",
        message: "WebSocket closed (reconnect disabled)",
      });
      return;
    }
    const attempt = ++this._reconnectAttempt;
    const base = this.options.reconnectDelay ?? 2000;
    const max = this.options.reconnectMaxDelay ?? 30000;
    const delay = Math.min(base * Math.pow(1.5, attempt - 1), max);
    const secs = Math.round(delay / 1000);
    safeEmit(this.options.onEvent, { type: "status", status: "reconnecting" });
    safeEmit(this.options.onEvent, {
      type: "log",
      message: `Reconnecting in ${secs}s… (attempt ${attempt})`,
    });
    this._reconnectTimer = setTimeout(() => {
      if (!this._manualDisconnect) this.connect();
    }, delay);
  }

  sendControlMessage(message: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }

  simulate(task: string): void {
    const taskId = randomTaskId();
    void this.handleTask({
      type: "task",
      taskId,
      task,
      userId: "demo-user",
      sessionId: "demo-session",
    });
  }

  private isTaskMessage(message: unknown): message is RelayInboundTask {
    if (!message || typeof message !== "object") return false;
    const record = message as Partial<RelayInboundTask>;
    return (
      record.type === "task" &&
      typeof record.userId === "string" &&
      typeof record.task === "string"
    );
  }

  private sendMessage(
    message: RelayOutboundOutput | RelayOutboundDone | RelayOutboundError
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      safeEmit(this.options.onEvent, {
        type: "log",
        message: `Failed to send message while socket closed: ${message.type}`,
      });
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  async handleTask(taskMessage: RelayInboundTask): Promise<void> {
    const taskId = taskMessage.taskId || randomTaskId();
    const { sessionId, task } = taskMessage;
    safeEmit(this.options.onEvent, { type: "taskStarted", taskId });
    safeEmit(this.options.onEvent, { type: "log", message: `Task started: ${taskId}` });

    try {
      const agentEndpoint =
        this.options.agentEndpoint ?? DEFAULT_AGENT_ENDPOINT;

      const response = await fetch(agentEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });

      if (!response.ok) {
        const errorMessage = `Computer Use agent returned ${response.status}`;
        this.sendMessage({ type: "error", taskId, sessionId, message: errorMessage });
        safeEmit(this.options.onEvent, { type: "taskError", taskId, message: errorMessage });
        return;
      }

      if (!response.body) {
        const errorMessage = "Computer Use agent response body was empty";
        this.sendMessage({ type: "error", taskId, sessionId, message: errorMessage });
        safeEmit(this.options.onEvent, { type: "taskError", taskId, message: errorMessage });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";
      let finalResult: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const event = parseNdjsonLine(line);
          if (!event) continue;

          if (event.type === "output" && event.data != null) {
            this.sendMessage({ type: "output", taskId, sessionId, data: event.data });
            safeEmit(this.options.onEvent, { type: "taskOutput", taskId, chunk: event.data });
          } else if (event.type === "done") {
            finalResult = event.result;
          } else if (event.type === "error" && event.message != null) {
            this.sendMessage({ type: "error", taskId, sessionId, message: event.message });
            safeEmit(this.options.onEvent, {
              type: "taskError",
              taskId,
              message: event.message,
            });
            return;
          }
        }
      }

      this.sendMessage({ type: "done", taskId, sessionId, result: finalResult });
      safeEmit(this.options.onEvent, { type: "taskDone", taskId, result: finalResult });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Computer Use agent not running on localhost:8001";
      this.sendMessage({ type: "error", taskId, sessionId, message });
      safeEmit(this.options.onEvent, { type: "taskError", taskId, message });
    }
  }
}
