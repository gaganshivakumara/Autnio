import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "motion/react";
import { ColorOrb } from "@/components/ui/ai-input";
import { recordAndTranscribe } from "../voice/VoiceInput";
import { speakText } from "../voice/VoiceOutput";

// CSS keyframes for the recording rings — injected once
const RING_STYLES = `
@keyframes halo-ring-expand {
  0%   { transform: scale(1);   opacity: 0.55; }
  100% { transform: scale(2.1); opacity: 0;    }
}
@keyframes halo-orb-breathe {
  0%, 100% { transform: scale(1);    }
  50%       { transform: scale(1.06); }
}
@keyframes halo-orb-speak {
  0%, 100% { transform: translateY(0px);  }
  25%       { transform: translateY(-3px); }
  75%       { transform: translateY(3px);  }
}
`;

// Use the Lambda Function URL directly — bypasses API Gateway's 29s timeout
const chatEndpoint: string =
  (import.meta.env.VITE_CHAT_ENDPOINT as string | undefined) ??
  `${import.meta.env.VITE_VOICE_API_URL as string}/chat`;

type VoiceState = "idle" | "recording" | "processing" | "speaking";

interface Exchange {
  query: string;
  response: string | null;
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

function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{ display: "block", width: 5, height: 5, borderRadius: "50%", background: "var(--green-atmos)" }}
          animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

const STATE_LABELS: Record<VoiceState, string> = {
  idle:       "press to speak",
  recording:  "listening…",
  processing: "thinking…",
  speaking:   "speaking…",
};

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
  const [exchange,    setExchange]    = useState<Exchange | null>(null);
  const [voiceState,  setVoiceState]  = useState<VoiceState>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const elapsed   = useElapsed(voiceState === "processing");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchange, voiceState]);

  // Core send — takes transcribed text, calls Bedrock Agent, returns response string
  const sendMessage = useCallback(async (text: string): Promise<string> => {
    const agentSessionId = sessionId ?? `s-${Date.now()}`;
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
    return display;
  }, [idToken, userId, sessionId, onSessionId]);

  const handleVoice = useCallback(async () => {
    if (voiceState !== "idle") return;

    // 1. Record
    setVoiceState("recording");
    let transcript = "";
    try {
      transcript = await recordAndTranscribe(idToken ?? "");
    } catch (err) {
      setExchange({ query: "—", response: err instanceof Error ? err.message : "Microphone error" });
      setVoiceState("idle");
      return;
    }

    if (!transcript.trim()) {
      setVoiceState("idle");
      return;
    }

    // 2. Process
    setVoiceState("processing");
    setExchange({ query: transcript, response: null });

    let response = "";
    try {
      response = await sendMessage(transcript);
    } catch (err) {
      response = err instanceof Error ? err.message : "Request failed";
    }
    setExchange({ query: transcript, response });

    // 3. Speak
    setVoiceState("speaking");
    try {
      await speakText(response, idToken);
    } catch { /* TTS failure is non-fatal */ }

    setVoiceState("idle");
  }, [voiceState, idToken, sendMessage]);

  const isRecording  = voiceState === "recording";
  const isProcessing = voiceState === "processing";
  const isSpeaking   = voiceState === "speaking";
  const isActive     = voiceState !== "idle";

  const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
    p:          ({ children }) => <p style={{ margin: "0 0 0.6em", color: "var(--ink-2)", lineHeight: 1.7, fontSize: "0.92rem" }}>{children}</p>,
    ul:         ({ children }) => <ul style={{ margin: "0 0 0.6em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ul>,
    ol:         ({ children }) => <ol style={{ margin: "0 0 0.6em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ol>,
    li:         ({ children }) => <li style={{ marginBottom: "0.25em", lineHeight: 1.65, fontSize: "0.92rem", color: "var(--ink-2)" }}>{children}</li>,
    strong:     ({ children }) => <strong style={{ color: "var(--ink-1)", fontWeight: 600 }}>{children}</strong>,
    h1:         ({ children }) => <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 400, color: "var(--ink-1)", margin: "1em 0 0.4em", letterSpacing: "-0.01em" }}>{children}</h2>,
    h2:         ({ children }) => <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 400, color: "var(--ink-1)", margin: "0.85em 0 0.35em" }}>{children}</h3>,
    h3:         ({ children }) => <h4 style={{ fontFamily: "var(--font-sans)", fontSize: "0.88rem", fontWeight: 500, color: "var(--ink-2)", margin: "0.7em 0 0.3em", textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</h4>,
    code:       ({ children }) => <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", background: "var(--sage-glow)", padding: "0.1em 0.4em", borderRadius: "0.3em", color: "var(--green-moss)" }}>{children}</code>,
    pre:        ({ children }) => <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", background: "var(--ink-1)", color: "var(--green-fog)", padding: "0.85rem 1.1rem", borderRadius: "var(--r-sm)", overflowX: "auto", margin: "0.6em 0" }}>{children}</pre>,
    hr:         () => <hr style={{ border: "none", borderTop: "1px solid var(--glass-stroke)", margin: "0.85em 0" }} />,
    blockquote: ({ children }) => <blockquote style={{ borderLeft: "2px solid var(--green-atmos)", paddingLeft: "0.85em", margin: "0.5em 0", color: "var(--ink-3)", fontStyle: "italic" }}>{children}</blockquote>,
  };

  return (
    <>
      {/* Inject ring keyframes once */}
      <style>{RING_STYLES}</style>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, width: "100%" }}>

        {/* ── Orb + rings ───────────────────────────────────────────────── */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 180, height: 180 }}>

          {/* Expanding rings during recording */}
          {isRecording && [0, 1].map((i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                width: 96,
                height: 96,
                borderRadius: "50%",
                border: "1.5px solid var(--green-atmos)",
                animation: `halo-ring-expand 1.6s ease-out infinite`,
                animationDelay: `${i * 0.55}s`,
                pointerEvents: "none",
              }}
            />
          ))}

          {/* Outer glow ring during speaking */}
          {isSpeaking && (
            <motion.span
              style={{
                position: "absolute",
                width: 108,
                height: 108,
                borderRadius: "50%",
                background: "var(--sage-glow-strong)",
                filter: "blur(12px)",
                pointerEvents: "none",
              }}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          {/* The orb button */}
          <motion.button
            onClick={handleVoice}
            disabled={isActive}
            aria-label={STATE_LABELS[voiceState]}
            style={{
              position: "relative",
              zIndex: 1,
              background: "none",
              border: "none",
              cursor: isActive ? "default" : "pointer",
              padding: 0,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              outline: "none",
              animation: isRecording
                ? undefined
                : isSpeaking
                ? "halo-orb-speak 1.2s ease-in-out infinite"
                : "halo-orb-breathe 4s ease-in-out infinite",
            }}
            animate={isRecording ? { scale: 1.1 } : { scale: 1 }}
            whileHover={!isActive ? { scale: 1.05 } : {}}
            whileTap={!isActive ? { scale: 0.96 } : {}}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <ColorOrb
              dimension="96px"
              spinDuration={isRecording ? 4 : isSpeaking ? 8 : 20}
              tones={isRecording ? {
                base:    "oklch(22% 0.06 160)",
                accent1: "oklch(68% 0.18 150)",
                accent2: "oklch(52% 0.16 158)",
                accent3: "oklch(60% 0.12 145)",
              } : {
                base:    "oklch(28% 0.04 160)",
                accent1: "oklch(62% 0.14 155)",
                accent2: "oklch(48% 0.12 162)",
                accent3: "oklch(55% 0.08 150)",
              }}
            />
          </motion.button>
        </div>

        {/* ── State label ───────────────────────────────────────────────── */}
        <div style={{ height: "2.2rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="dots"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <ThinkingDots />
                {elapsed >= 8 && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-4)", letterSpacing: "0.04em" }}
                  >
                    working on your computer… {elapsed}s
                  </motion.span>
                )}
              </motion.div>
            ) : (
              <motion.span
                key={voiceState}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.28em",
                  color: isActive ? "var(--green-moss)" : "var(--ink-4)",
                }}
              >
                {STATE_LABELS[voiceState]}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* ── Exchange card ─────────────────────────────────────────────── */}
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
                marginTop: "1.5rem",
                background: "var(--glass-light)",
                backdropFilter: "blur(var(--blur))",
                WebkitBackdropFilter: "blur(var(--blur))",
                border: "1px solid var(--glass-stroke)",
                borderRadius: "var(--r-md)",
                boxShadow: "var(--shadow-card)",
                overflow: "hidden",
              }}
            >
              {/* User query */}
              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "0.85rem 1rem 0.7rem",
                borderBottom: "1px solid var(--glass-stroke)",
              }}>
                <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--ink-4)" }}>
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

              {/* Response */}
              <div style={{ padding: "0.85rem 1rem 1rem" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--green-moss)", display: "block", marginBottom: "0.5rem" }}>
                  halo
                </span>
                <AnimatePresence mode="wait">
                  {exchange.response === null ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ThinkingDots />
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

              <div ref={bottomRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
