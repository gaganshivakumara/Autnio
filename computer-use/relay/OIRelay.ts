import type {
  RelayEvent,
  RelayInboundTask,
  RelayOptions,
  RelayOutboundDone,
  RelayOutboundError,
  RelayOutboundOutput,
} from "./types";

const DEFAULT_OI_ENDPOINT = "http://localhost:8000/openai/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

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

function parseSseEvent(eventText: string): string[] {
  const lines = eventText.split("\n");
  const chunks: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;

    const payload = trimmed.replace(/^data:\s*/, "");
    if (payload === "[DONE]") continue;

    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.delta?.content;
      if (content) chunks.push(content);
    } catch {
      // Ignore malformed SSE chunks.
    }
  }

  return chunks;
}

export class OIRelay {
  private ws: WebSocket | null = null;
  private readonly options: RelayOptions;

  constructor(options: RelayOptions) {
    this.options = options;
  }

  connect(): void {
    safeEmit(this.options.onEvent, { type: "status", status: "connecting" });
    const url = `${this.options.wsEndpoint}?token=${encodeURIComponent(this.options.idToken)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      safeEmit(this.options.onEvent, { type: "status", status: "connected" });
      safeEmit(this.options.onEvent, { type: "log", message: "WebSocket connected" });
    };

    this.ws.onclose = () => {
      safeEmit(this.options.onEvent, { type: "status", status: "closed" });
      safeEmit(this.options.onEvent, { type: "log", message: "WebSocket closed" });
    };

    this.ws.onerror = () => {
      safeEmit(this.options.onEvent, { type: "status", status: "error" });
      safeEmit(this.options.onEvent, { type: "log", message: "WebSocket error" });
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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

  private sendMessage(message: RelayOutboundOutput | RelayOutboundDone | RelayOutboundError): void {
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
      const oiEndpoint = this.options.oiEndpoint ?? DEFAULT_OI_ENDPOINT;
      const model = this.options.model ?? DEFAULT_MODEL;
      const response = await fetch(oiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: "user", content: task }],
        }),
      });

      if (!response.ok) {
        const errorMessage = `Open Interpreter returned ${response.status}`;
        this.sendMessage({ type: "error", taskId, sessionId, message: errorMessage });
        safeEmit(this.options.onEvent, { type: "taskError", taskId, message: errorMessage });
        return;
      }

      if (!response.body) {
        const errorMessage = "Open Interpreter response body was empty";
        this.sendMessage({ type: "error", taskId, sessionId, message: errorMessage });
        safeEmit(this.options.onEvent, { type: "taskError", taskId, message: errorMessage });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() ?? "";

        for (const eventText of events) {
          const chunks = parseSseEvent(eventText);
          for (const chunk of chunks) {
            fullText += chunk;
            this.sendMessage({ type: "output", taskId, sessionId, data: chunk });
            safeEmit(this.options.onEvent, { type: "taskOutput", taskId, chunk });
          }
        }
      }

      this.sendMessage({ type: "done", taskId, sessionId, result: fullText || undefined });
      safeEmit(this.options.onEvent, { type: "taskDone", taskId, result: fullText || undefined });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Open Interpreter not running on localhost:8000";
      this.sendMessage({ type: "error", taskId, sessionId, message });
      safeEmit(this.options.onEvent, { type: "taskError", taskId, message });
    }
  }
}
