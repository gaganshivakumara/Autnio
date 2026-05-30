import { useEffect, useMemo, useRef, useState } from "react";
import { OIRelay, type RelayEvent } from "../../relay";

type RelayStatus = "idle" | "connecting" | "connected" | "closed" | "error";

function randomTaskId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `task-${Date.now()}`;
}

function queryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

export function App(): JSX.Element {
  const [wsEndpoint, setWsEndpoint] = useState(
    queryParam("wsEndpoint") ?? "wss://3cil79jtm9.execute-api.us-east-1.amazonaws.com/dev",
  );
  const [idToken, setIdToken] = useState(queryParam("idToken") ?? "demo-token");
  const [taskText, setTaskText] = useState("Say hello from Open Interpreter.");
  const [oiStatus, setOiStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);

  const relayRef = useRef<OIRelay | null>(null);
  const appMode = queryParam("appMode") ?? "web";

  const canConnect = useMemo(() => relayStatus === "idle" || relayStatus === "closed" || relayStatus === "error", [relayStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch("http://localhost:8000/openai/chat/completions", {
      method: "OPTIONS",
    })
      .then(() => {
        if (!cancelled) setOiStatus("online");
      })
      .catch(() => {
        if (!cancelled) setOiStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const appendLog = (line: string): void => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);
  };

  const handleEvent = (event: RelayEvent): void => {
    if (event.type === "status") setRelayStatus(event.status);
    if (event.type === "log") appendLog(event.message);
    if (event.type === "taskOutput") appendLog(`output(${event.taskId}): ${event.chunk}`);
    if (event.type === "taskDone") appendLog(`done(${event.taskId}): ${event.result ?? "(no final text)"}`);
    if (event.type === "taskError") appendLog(`error(${event.taskId}): ${event.message}`);
  };

  const connectRelay = (): void => {
    if (relayRef.current) relayRef.current.disconnect();
    const relay = new OIRelay({
      wsEndpoint,
      idToken,
      onEvent: handleEvent,
    });
    relay.connect();
    relayRef.current = relay;
  };

  const disconnectRelay = (): void => {
    relayRef.current?.disconnect();
    relayRef.current = null;
    setRelayStatus("closed");
  };

  const simulateTask = (): void => {
    if (!relayRef.current) {
      appendLog("Cannot simulate task: relay not connected");
      return;
    }
    relayRef.current.simulate(taskText);
  };

  return (
    <main className="container">
      <h1>Autnio Computer Use Relay Demo</h1>
      <p className="subtitle">
        {appMode === "macos"
          ? "App mode relay UI (embedded in macOS SwiftUI wrapper)."
          : "Standalone relay UI for local Open Interpreter testing."}
      </p>

      <section className="card">
        <label>
          WebSocket endpoint
          <input value={wsEndpoint} onChange={(e) => setWsEndpoint(e.target.value)} />
        </label>
        <label>
          ID token
          <input value={idToken} onChange={(e) => setIdToken(e.target.value)} />
        </label>
        <label>
          Simulated task text
          <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={3} />
        </label>
        <div className="statusRow">
          <span>Relay status: <strong>{relayStatus}</strong></span>
          <span>Open Interpreter: <strong>{oiStatus}</strong></span>
        </div>
        <div className="buttonRow">
          <button onClick={connectRelay} disabled={!canConnect}>Connect Relay</button>
          <button onClick={disconnectRelay}>Disconnect</button>
          <button onClick={simulateTask}>Simulate Task</button>
          <button onClick={() => setLogs([])}>Clear Logs</button>
        </div>
      </section>

      <section className="card">
        <h2>Logs</h2>
        <pre className="logs">{logs.length ? logs.join("\n") : "No logs yet."}</pre>
      </section>
    </main>
  );
}
