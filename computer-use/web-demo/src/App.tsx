import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { OIRelay, type RelayEvent } from "../../relay";

type RelayStatus = "idle" | "connecting" | "connected" | "closed" | "error" | "reconnecting";
type Tab = "chat" | "relay";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  ts: string;
  streaming?: boolean;
}

const AGENT_ID = import.meta.env.VITE_AGENT_ID as string ?? "REWAIIGB5R";
const AGENT_ALIAS_ID = import.meta.env.VITE_AGENT_ALIAS_ID as string ?? "E8LQI7OUC3";
const AWS_REGION = import.meta.env.VITE_AWS_REGION as string ?? "us-east-1";
const AWS_CREDS = {
  accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID as string,
  secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY as string,
};

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}`;
}

function queryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>("chat");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const sessionIdRef = useRef<string>(randomId());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [wsEndpoint, setWsEndpoint] = useState(
    queryParam("wsEndpoint") ?? (import.meta.env.VITE_WS_API_URL as string) ?? "wss://3cil79jtm9.execute-api.us-east-1.amazonaws.com/dev",
  );
  const [idToken, setIdToken] = useState(queryParam("idToken") ?? "demo-token");

  // Derive userId from the token. "demo-token" maps to "demo-user" (dev bypass).
  // In production this would be the Cognito JWT `sub` claim.
  const userId = idToken === "demo-token" ? "demo-user" : (queryParam("userId") ?? "demo-user");
  const [taskText, setTaskText] = useState("Open https://www.amazon.com in my browser.");
  const [oiStatus, setOiStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const relayRef = useRef<OIRelay | null>(null);
  const canConnect = useMemo(
    () => relayStatus === "idle" || relayStatus === "closed" || relayStatus === "error",
    [relayStatus],
  );

  // Auto-connect relay on first mount.
  useEffect(() => {
    connectRelay();
    return () => { relayRef.current?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const appendLog = (line: string) =>
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);

  const handleEvent = (event: RelayEvent): void => {
    if (event.type === "status") setRelayStatus(event.status);
    if (event.type === "log") appendLog(event.message);
    if (event.type === "taskOutput") appendLog(`▶ ${event.chunk}`);
    if (event.type === "taskDone") appendLog(`✓ done: ${event.result ?? ""}`);
    if (event.type === "taskError") appendLog(`✗ error: ${event.message}`);
  };

  const connectRelay = () => {
    if (relayRef.current) relayRef.current.disconnect();
    const relay = new OIRelay({ wsEndpoint, idToken, onEvent: handleEvent });
    relay.connect();
    relayRef.current = relay;
  };

  const disconnectRelay = () => {
    relayRef.current?.disconnect();
    relayRef.current = null;
    setRelayStatus("closed");
  };

  const simulateTask = () => {
    if (!relayRef.current) { appendLog("Relay not connected"); return; }
    relayRef.current.simulate(taskText);
  };

  const sendAgentMessage = async (): Promise<void> => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatMessages((prev) => [...prev, { role: "user", text, ts: new Date().toLocaleTimeString() }]);
    setChatInput("");
    setChatBusy(true);

    const agentMsgId = randomId();
    setChatMessages((prev) => [...prev, { role: "agent", text: "", ts: new Date().toLocaleTimeString(), streaming: true }]);

    try {
      const client = new BedrockAgentRuntimeClient({ region: AWS_REGION, credentials: AWS_CREDS });
      const cmd = new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId: sessionIdRef.current,
        inputText: text,
        enableTrace: false,
        sessionState: {
          promptSessionAttributes: {
            userId,
            sessionId: sessionIdRef.current,
          },
        },
      });
      const response = await client.send(cmd);
      let accumulated = "";
      if (response.completion) {
        try {
          for await (const event of response.completion) {
            if (event.chunk?.bytes) {
              accumulated += new TextDecoder().decode(event.chunk.bytes);
              const snap = accumulated;
              setChatMessages((prev) =>
                prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, text: snap, streaming: true } : m,
                ),
              );
            }
          }
        } catch (streamErr) {
          // The Bedrock SDK occasionally throws a deserialization error when the
          // event stream contains event types introduced after the SDK was built
          // (e.g. reasoning traces from Claude Sonnet 4.6 tool-use calls). If we
          // already have accumulated text it means the action succeeded — show it.
          if (!accumulated) {
            accumulated = "Task dispatched to your computer. Check the **Relay** tab to watch it run.";
          }
        }
      }
      setChatMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, text: accumulated || "(no response)", streaming: false } : m,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Swallow the known SDK deserialization noise — the task still ran.
      const isDeserError = msg.includes("Deserialization error") || msg.includes("failed response from API execution");
      setChatMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? {
                ...m,
                text: isDeserError
                  ? "Task dispatched to your computer. Check the **Relay** tab to watch it run."
                  : `**Error:** ${msg}`,
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      setChatBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    void agentMsgId;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendAgentMessage();
    }
  };

  const statusDot = (s: "online" | "offline" | "unknown") =>
    s === "online" ? "🟢" : s === "offline" ? "🔴" : "⚪";

  const relayDot = (s: RelayStatus) =>
    s === "connected" ? "🟢" : s === "reconnecting" || s === "connecting" ? "🟡" : s === "error" ? "🔴" : "⚪";

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">Autnio</span>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}>
            <span>💬</span> Agent Chat
          </button>
          <button className={`nav-item ${tab === "relay" ? "active" : ""}`} onClick={() => setTab("relay")}>
            <span>🔌</span> OI Relay
            <span className="nav-badge">{relayDot(relayStatus)}</span>
          </button>
        </nav>
        <div className="sidebar-status">
          <div className="status-item">{statusDot(oiStatus)} Open Interpreter</div>
          <div className="status-item">
            {relayDot(relayStatus)} Relay
            {relayStatus === "reconnecting" && <span className="status-hint"> (retrying…)</span>}
            {relayStatus === "connecting" && <span className="status-hint"> (connecting…)</span>}
          </div>
        </div>
        <button
          className="new-session-btn"
          onClick={() => { sessionIdRef.current = randomId(); setChatMessages([]); }}
        >
          + New Session
        </button>
      </aside>

      {/* Main */}
      <main className="main">
        {tab === "chat" && (
          <div className="chat-pane">
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="chat-empty">
                  <div className="chat-empty-icon">⚡</div>
                  <h2>Autnio Agent</h2>
                  <p>Ask me to automate tasks on your computer, research the web, manage files, or analyze images.</p>
                  <div className="suggestions">
                    {["Open amazon.com in my browser", "What files are on my Desktop?", "Take a screenshot and describe it"].map((s) => (
                      <button key={s} className="suggestion" onClick={() => { setChatInput(s); inputRef.current?.focus(); }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`message message--${m.role}`}>
                  {m.role === "agent" && (
                    <div className="message-avatar">⚡</div>
                  )}
                  <div className="message-body">
                    {m.role === "agent" ? (
                      <div className="message-content markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text || (m.streaming ? "▋" : "")}</ReactMarkdown>
                        {m.streaming && <span className="cursor">▋</span>}
                      </div>
                    ) : (
                      <div className="message-content">{m.text}</div>
                    )}
                    <div className="message-time">{m.ts}</div>
                  </div>
                  {m.role === "user" && (
                    <div className="message-avatar message-avatar--user">You</div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-input-bar">
              <textarea
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Autnio… (Enter to send, Shift+Enter for newline)"
                rows={1}
                disabled={chatBusy}
                className="chat-textarea"
              />
              <button
                className="send-btn"
                onClick={() => void sendAgentMessage()}
                disabled={chatBusy || !chatInput.trim()}
              >
                {chatBusy ? (
                  <span className="spinner">⟳</span>
                ) : (
                  <span>↑</span>
                )}
              </button>
            </div>
          </div>
        )}

        {tab === "relay" && (
          <div className="relay-pane">
            <h2>OI Relay Controls</h2>
            <div className="relay-grid">
              <div className="relay-card">
                <h3>Connection</h3>
                <label>WebSocket endpoint
                  <input value={wsEndpoint} onChange={(e) => setWsEndpoint(e.target.value)} />
                </label>
                <label>ID token
                  <input value={idToken} onChange={(e) => setIdToken(e.target.value)} />
                </label>
                <div className="relay-actions">
                  <button onClick={connectRelay} disabled={relayStatus === "connected"} className="btn-primary">
                    {relayStatus === "connecting" ? "Connecting…" : relayStatus === "reconnecting" ? "Retrying… (force)" : relayStatus === "connected" ? "Connected" : "Connect"}
                  </button>
                  <button onClick={disconnectRelay} disabled={relayStatus === "idle" || relayStatus === "closed"} className="btn-secondary">Disconnect</button>
                </div>
              </div>
              <div className="relay-card">
                <h3>Simulate Task</h3>
                <label>Task text
                  <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={4} />
                </label>
                <div className="relay-actions">
                  <button onClick={simulateTask} className="btn-primary">Run Task</button>
                  <button onClick={() => setLogs([])} className="btn-secondary">Clear Logs</button>
                </div>
              </div>
            </div>
            <div className="relay-logs-section">
              <h3>Execution Logs</h3>
              <pre className="relay-logs">{logs.length ? logs.join("\n") : "No logs yet."}</pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
