import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MorphPanel } from "@/components/ui/ai-input";

// Use the Lambda Function URL directly — bypasses API Gateway's 29s timeout
// so long-running computer-use tasks can complete without a 504.
const chatEndpoint: string =
  (import.meta.env.VITE_CHAT_ENDPOINT as string | undefined) ??
  `${import.meta.env.VITE_VOICE_API_URL as string}/chat`;

interface Exchange {
  query: string;
  response: string | null; // null while loading
}

function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

export function ChatInterface({
  idToken,
  userId,
  sessionId,
  onSessionId,
}: {
  idToken?: string;
  // The user's paired computer access code — passed as userId to the Bedrock Agent
  // session attributes so dispatch knows which machine to route tasks to.
  userId?: string;
  // Session is owned by the parent so a camera discovery and its follow-up
  // questions share one Bedrock session, and a new capture can rotate it.
  sessionId?: string;
  onSessionId?: (id: string) => void;
}): JSX.Element {
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsed(loading);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchange, loading]);

  const handleSend = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || loading) return;

    const agentSessionId = sessionId ?? `s-${Date.now()}`;
    setLoading(true);
    setExchange({ query: text, response: null });

    try {
      const res = await fetch(chatEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ message: text, sessionId: agentSessionId, ...(userId ? { userId } : {}) }),
      });
      const body = await res.text();
      let display = body || `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { response?: string; sessionId?: string; message?: string; result?: string };
        if (parsed.sessionId) onSessionId?.(parsed.sessionId);
        display = parsed.response ?? parsed.message ?? parsed.result ?? display;
      } catch { /* not JSON */ }
      setExchange({ query: text, response: display });
    } catch (err) {
      setExchange({ query: text, response: err instanceof Error ? err.message : "Chat request failed" });
    } finally {
      setLoading(false);
    }
  }, [idToken, userId, sessionId, onSessionId, loading]);

  const statusLabel = loading
    ? elapsed >= 10
      ? `working on your computer… ${elapsed}s`
      : "thinking..."
    : null;

  const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
    p:      ({ children }) => <p style={{ margin: "0 0 0.5rem", color: "var(--ink-2)", lineHeight: 1.65 }}>{children}</p>,
    ul:     ({ children }) => <ul style={{ margin: "0 0 0.5rem", paddingLeft: "1.25rem", color: "var(--ink-2)" }}>{children}</ul>,
    ol:     ({ children }) => <ol style={{ margin: "0 0 0.5rem", paddingLeft: "1.25rem", color: "var(--ink-2)" }}>{children}</ol>,
    li:     ({ children }) => <li style={{ marginBottom: "0.2rem", lineHeight: 1.6 }}>{children}</li>,
    strong: ({ children }) => <strong style={{ color: "var(--ink-1)", fontWeight: 600 }}>{children}</strong>,
    h1:     ({ children }) => <h2 style={{ fontSize: "1.1rem", fontWeight: 500, color: "var(--ink-1)", margin: "0.75rem 0 0.35rem" }}>{children}</h2>,
    h2:     ({ children }) => <h3 style={{ fontSize: "1rem",   fontWeight: 500, color: "var(--ink-1)", margin: "0.65rem 0 0.3rem" }}>{children}</h3>,
    h3:     ({ children }) => <h4 style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--ink-1)", margin: "0.5rem 0 0.25rem" }}>{children}</h4>,
    code:   ({ children }) => <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", background: "rgba(27,36,29,0.06)", padding: "0.1em 0.35em", borderRadius: "0.25rem", color: "var(--ink-1)" }}>{children}</code>,
    pre:    ({ children }) => <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", background: "var(--ink-1)", color: "var(--green-fog)", padding: "0.75rem 1rem", borderRadius: "0.5rem", overflowX: "auto", margin: "0.5rem 0" }}>{children}</pre>,
    hr:     () => <hr style={{ border: "none", borderTop: "1px solid rgba(27,36,29,0.1)", margin: "0.75rem 0" }} />,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", width: "100%" }}>
      <MorphPanel onSend={handleSend} isLoading={loading} />

      {exchange && (
        <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {/* User query bubble */}
          <div style={{
            alignSelf: "flex-end",
            maxWidth: "88%",
            padding: "0.55rem 0.9rem",
            borderRadius: "0.75rem",
            background: "rgba(27,36,29,0.07)",
            border: "1px solid rgba(27,36,29,0.09)",
            fontSize: "0.88rem",
            lineHeight: "1.5",
            color: "var(--ink-1)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.03em",
          }}>
            {exchange.query}
          </div>

          {/* Assistant response or typing indicator */}
          <div style={{ alignSelf: "flex-start", maxWidth: "92%", fontSize: "0.88rem" }}>
            {exchange.response === null ? (
              <span style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)", fontSize: "1.1rem", letterSpacing: "0.15em" }}>···</span>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {exchange.response}
              </ReactMarkdown>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      )}

      {statusLabel && (
        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--ink-4)", margin: 0, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
          {statusLabel}
        </p>
      )}
    </div>
  );
}
