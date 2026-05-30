import { useEffect, useMemo, useRef, useState } from "react";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { OIRelay, type RelayEvent } from "../../relay";

type RelayStatus = "idle" | "connecting" | "connected" | "closed" | "error";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  ts: string;
}

const AGENT_ID = "REWAIIGB5R";
const AGENT_ALIAS_ID = "E8LQI7OUC3";
const AWS_REGION = "us-east-1";
const AWS_CREDS = {
  accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID as string,
  secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY as string,
};

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

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const sessionIdRef = useRef<string>(randomTaskId());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const relayRef = useRef<OIRelay | null>(null);
  const appMode = queryParam("appMode") ?? "web";

  const canConnect = useMemo(
    () => relayStatus === "idle" || relayStatus === "closed" || relayStatus === "error",
    [relayStatus],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("http://localhost:8000/openai/chat/completions", { method: "OPTIONS" })
      .then(() => { if (!cancelled) setOiStatus("online"); })
      .catch(() => { if (!cancelled) setOiStatus("offline"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

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
    const relay = new OIRelay({ wsEndpoint, idToken, onEvent: handleEvent });
    relay.connect();
    relayRef.current = relay;
  };

  const disconnectRelay = (): void => {
    relayRef.current?.disconnect();
    relayRef.current = null;
    setRelayStatus("closed");
  };

  const simulateTask = (): void => {
    if (!relayRef.current) { appendLog("Cannot simulate task: relay not connected"); return; }
    relayRef.current.simulate(taskText);
  };

  const sendAgentMessage = async (): Promise<void> => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const ts = new Date().toLocaleTimeString();
    setChatMessages((prev) => [...prev, { role: "user", text, ts }]);
    setChatInput("");
    setChatBusy(true);

    try {
      const client = new BedrockAgentRuntimeClient({ region: AWS_REGION, credentials: AWS_CREDS });
      const cmd = new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId: sessionIdRef.current,
        inputText: text,
        enableTrace: false,
      });
      const response = await client.send(cmd);
      let agentText = "";
      if (response.completion) {
        for await (const event of response.completion) {
          if (event.chunk?.bytes) {
            agentText += new TextDecoder().decode(event.chunk.bytes);
          }
        }
      }
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", text: agentText || "(no response)", ts: new Date().toLocaleTimeString() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${msg}`, ts: new Date().toLocaleTimeString() },
      ]);
    } finally {
      setChatBusy(false);
    }
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
        <h2>
          Agent Chat{" "}
          <span style={{ fontSize: "0.75rem", fontWeight: 400, opacity: 0.6 }}>
            session: {sessionIdRef.current.slice(0, 8)}
          </span>
        </h2>
        <div className="chatLog">
          {chatMessages.length === 0 && (
            <p style={{ opacity: 0.5, margin: 0 }}>No messages yet. Ask the agent anything.</p>
          )}
          {chatMessages.map((m, i) => (
            <div key={i} className={`chatMsg chatMsg--${m.role}`}>
              <div className="chatMeta">
                <span className="chatRole">{m.role === "user" ? "You" : "Agent"}</span>
                <span className="chatTime">{m.ts}</span>
              </div>
              <pre className="chatText">{m.text}</pre>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="chatInputRow">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendAgentMessage();
              }
            }}
            placeholder="Ask the agent something… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={chatBusy}
          />
          <div className="chatButtons">
            <button onClick={() => void sendAgentMessage()} disabled={chatBusy || !chatInput.trim()}>
              {chatBusy ? "Thinking…" : "Send"}
            </button>
            <button
              onClick={() => {
                sessionIdRef.current = randomTaskId();
                setChatMessages([]);
              }}
            >
              New session
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>OI Relay</h2>
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
        <h2>Relay Logs</h2>
        <pre className="logs">{logs.length ? logs.join("\n") : "No logs yet."}</pre>
      </section>
    </main>
  );
}
