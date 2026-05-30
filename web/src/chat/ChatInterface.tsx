import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "motion/react";
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

// Three softly pulsing dots that use the brand green palette
function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: "5px", alignItems: "center", padding: "2px 0" }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{
            display: "block",
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--green-atmos)",
          }}
          animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

export function ChatInterface({
  idToken,
  userId,
  sessionId,
  onSessionId,
}: {
  idToken?: string;
  userId?: string;
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

  const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
    p:      ({ children }) => <p style={{ margin: "0 0 0.6em", color: "var(--ink-2)", lineHeight: 1.7, fontSize: "0.92rem" }}>{children}</p>,
    ul:     ({ children }) => <ul style={{ margin: "0 0 0.6em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ul>,
    ol:     ({ children }) => <ol style={{ margin: "0 0 0.6em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ol>,
    li:     ({ children }) => <li style={{ marginBottom: "0.25em", lineHeight: 1.65, fontSize: "0.92rem", color: "var(--ink-2)" }}>{children}</li>,
    strong: ({ children }) => <strong style={{ color: "var(--ink-1)", fontWeight: 600 }}>{children}</strong>,
    h1:     ({ children }) => <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 400, color: "var(--ink-1)", margin: "1em 0 0.4em", letterSpacing: "-0.01em" }}>{children}</h2>,
    h2:     ({ children }) => <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 400, color: "var(--ink-1)", margin: "0.85em 0 0.35em" }}>{children}</h3>,
    h3:     ({ children }) => <h4 style={{ fontFamily: "var(--font-sans)", fontSize: "0.88rem", fontWeight: 500, color: "var(--ink-2)", margin: "0.7em 0 0.3em", textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</h4>,
    code:   ({ children }) => <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", background: "var(--sage-glow)", padding: "0.1em 0.4em", borderRadius: "0.3em", color: "var(--green-moss)" }}>{children}</code>,
    pre:    ({ children }) => <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", background: "var(--ink-1)", color: "var(--green-fog)", padding: "0.85rem 1.1rem", borderRadius: "var(--r-sm)", overflowX: "auto", margin: "0.6em 0", boxShadow: "var(--shadow-card)" }}>{children}</pre>,
    hr:     () => <hr style={{ border: "none", borderTop: "1px solid var(--glass-stroke)", margin: "0.85em 0" }} />,
    blockquote: ({ children }) => <blockquote style={{ borderLeft: "2px solid var(--green-atmos)", paddingLeft: "0.85em", margin: "0.5em 0", color: "var(--ink-3)", fontStyle: "italic" }}>{children}</blockquote>,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, width: "100%" }}>
      <MorphPanel onSend={handleSend} isLoading={loading} />

      <AnimatePresence>
        {exchange && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.6 }}
            style={{
              width: "100%",
              maxWidth: 520,
              marginTop: "0.75rem",
              background: "var(--glass-light)",
              backdropFilter: "blur(var(--blur))",
              WebkitBackdropFilter: "blur(var(--blur))",
              border: "1px solid var(--glass-stroke)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-card)",
              overflow: "hidden",
            }}
          >
            {/* User query row */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "0.85rem 1rem 0.7rem",
              borderBottom: "1px solid var(--glass-stroke)",
            }}>
              <div style={{
                maxWidth: "85%",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "0.2rem",
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.62rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.22em",
                  color: "var(--ink-4)",
                }}>
                  you
                </span>
                <span style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.9rem",
                  color: "var(--ink-1)",
                  lineHeight: 1.55,
                  background: "var(--sage-glow)",
                  padding: "0.45rem 0.8rem",
                  borderRadius: "var(--r-sm) var(--r-sm) 3px var(--r-sm)",
                  border: "1px solid rgba(143,191,143,0.2)",
                }}>
                  {exchange.query}
                </span>
              </div>
            </div>

            {/* Response row */}
            <div style={{ padding: "0.85rem 1rem 1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.62rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.22em",
                  color: "var(--green-moss)",
                }}>
                  halo
                </span>

                <AnimatePresence mode="wait">
                  {exchange.response === null ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ display: "flex", alignItems: "center", gap: "0.6rem", minHeight: "1.5rem" }}
                    >
                      <ThinkingDots />
                      {elapsed >= 10 && (
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            color: "var(--ink-4)",
                            letterSpacing: "0.04em",
                          }}
                        >
                          working on your computer… {elapsed}s
                        </motion.span>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="response"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {exchange.response}
                      </ReactMarkdown>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div ref={bottomRef} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
