const OI_LOCAL_URL = "http://localhost:8000/openai/chat/completions";

export type RelayStatus = "idle" | "connecting" | "connected" | "closed" | "error";

export type RelayEvent =
  | { type: "status"; status: RelayStatus }
  | { type: "log"; message: string };

export type StartRelayOptions = {
  wsEndpoint: string;
  onEvent?: (event: RelayEvent) => void;
};

function emit(onEvent: StartRelayOptions["onEvent"], event: RelayEvent): void {
  onEvent?.(event);
}

export function startRelay({ wsEndpoint, onEvent }: StartRelayOptions): WebSocket {
  emit(onEvent, { type: "status", status: "connecting" });
  const ws = new WebSocket(wsEndpoint);

  ws.onopen = () => emit(onEvent, { type: "status", status: "connected" });
  ws.onclose = () => emit(onEvent, { type: "status", status: "closed" });
  ws.onerror = () => emit(onEvent, { type: "status", status: "error" });

  ws.onmessage = async (event) => {
    const { task, sessionId } = JSON.parse(event.data) as {
      task: string;
      sessionId: string;
    };

    emit(onEvent, { type: "log", message: `Received task ${sessionId}` });

    try {
      const response = await fetch(OI_LOCAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          messages: [{ role: "user", content: task }],
        }),
      });

      if (!response.body) {
        ws.send(JSON.stringify({ type: "error", sessionId, message: "Open Interpreter returned no stream" }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        ws.send(JSON.stringify({ type: "output", sessionId, data: decoder.decode(value) }));
      }
      ws.send(JSON.stringify({ type: "done", sessionId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Open Interpreter relay failed";
      ws.send(JSON.stringify({ type: "error", sessionId, message }));
      emit(onEvent, { type: "log", message });
    }
  };

  return ws;
}
