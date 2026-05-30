// Product-Discovery–specific voice chat.
//
// Intentionally separate from the homepage chat (../chat/ChatInterface, the
// floating "Ask halo" orb panel). This one is an inline card that matches the
// Product Discovery page skeleton (dash-card + mono labels), shares the page's
// per-product Bedrock session, speaks every answer, and lets the mic double as
// a "take a picture" command.
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { recordAndTranscribe } from "../voice/VoiceInput";
import { speakText } from "../voice/VoiceOutput";
import { isCaptureCommand } from "../voice/commands";

const chatEndpoint: string =
  (import.meta.env.VITE_CHAT_ENDPOINT as string | undefined) ??
  `${import.meta.env.VITE_VOICE_API_URL as string}/chat`;

type Message = { role: "user" | "assistant"; text: string };
type State = "idle" | "listening" | "thinking" | "speaking";

export function ProductChat({
  sessionId,
  onSessionId,
  idToken,
  userId,
  onCaptureCommand,
  placeholder,
}: {
  sessionId?: string;
  onSessionId?: (id: string) => void;
  idToken?: string;
  userId?: string;
  onCaptureCommand?: () => void;
  placeholder?: string;
}): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, state]);

  const ask = useCallback(async (text: string): Promise<void> => {
    setMessages((prev) => [...prev, { role: "user", text }]);
    setState("thinking");
    let answer = "";
    try {
      const res = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ message: text, sessionId: sessionId ?? `product-${Date.now()}`, ...(userId ? { userId } : {}) }),
      });
      const body = await res.text();
      answer = body || `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { response?: string; sessionId?: string; message?: string; result?: string };
        if (parsed.sessionId) onSessionId?.(parsed.sessionId);
        answer = parsed.response ?? parsed.message ?? parsed.result ?? answer;
      } catch { /* not JSON */ }
    } catch (e) {
      answer = e instanceof Error ? e.message : "Request failed";
    }
    setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    setState("speaking");
    try { await speakText(answer, idToken); } catch { /* TTS non-fatal */ }
    setState("idle");
  }, [idToken, userId, sessionId, onSessionId]);

  const handleMic = useCallback(async () => {
    if (state !== "idle") return;
    setState("listening");
    let transcript = "";
    try {
      transcript = await recordAndTranscribe(idToken ?? "");
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: e instanceof Error ? e.message : "Microphone error" }]);
      setState("idle");
      return;
    }
    if (!transcript.trim()) { setState("idle"); return; }

    // The mic doubles as a capture trigger: "take a picture", "what is this", …
    if (isCaptureCommand(transcript)) {
      setMessages((prev) => [...prev, { role: "user", text: transcript }, { role: "assistant", text: "📸 Capturing…" }]);
      setState("idle");
      onCaptureCommand?.();
      return;
    }
    await ask(transcript);
  }, [state, idToken, onCaptureCommand, ask]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || state !== "idle") return;
    setInput("");
    void ask(text);
  }, [input, state, ask]);

  const stateLabel: Record<State, string> = {
    idle: "Press the mic and ask, or type below",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  };

  return (
    <section className="dash-card">
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.28em", color: "var(--ink-3)", marginBottom: "1rem" }}>
        Ask about this product
      </div>

      {/* Conversation */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 80, maxHeight: 320, overflowY: "auto", marginBottom: "1rem" }}>
        {messages.length === 0 && (
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.9rem", color: "var(--ink-4)", lineHeight: 1.6 }}>
            After a scan, ask things like “is it worth the price?” or “what do reviewers complain about?”.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "82%",
              padding: m.role === "assistant" ? "10px 14px" : "9px 13px",
              borderRadius: m.role === "user" ? "13px 13px 3px 13px" : "13px 13px 13px 3px",
              background: m.role === "user" ? "oklch(38% 0.10 155)" : "var(--cloud)",
              border: m.role === "assistant" ? "1px solid var(--glass-stroke)" : "none",
              color: m.role === "user" ? "#fff" : "var(--ink-1)",
              fontFamily: "var(--font-sans)", fontSize: "0.875rem", lineHeight: 1.6, wordBreak: "break-word",
            }}>
              {m.role === "assistant"
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                : m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} style={{ height: 0 }} />
      </div>

      {/* Input row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={handleMic}
          disabled={state !== "idle"}
          aria-label={state === "listening" ? "Listening" : "Hold to speak"}
          style={{
            flexShrink: 0, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%",
            border: state === "listening" ? "1px solid oklch(55% 0.14 155)" : "1px solid var(--glass-stroke)",
            background: state === "listening" ? "oklch(55% 0.14 155 / 0.12)" : "transparent",
            color: state === "listening" ? "oklch(45% 0.14 155)" : "var(--ink-2)",
            cursor: state === "idle" ? "pointer" : "default", transition: "all 0.15s",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
        <input
          className="dash-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
          placeholder={placeholder ?? "Ask about this product…"}
          disabled={state === "thinking" || state === "speaking"}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || state !== "idle"}
          aria-label="Send"
          style={{
            flexShrink: 0, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%", border: "none",
            background: input.trim() && state === "idle" ? "oklch(38% 0.10 155)" : "rgba(27,36,29,0.06)",
            color: input.trim() && state === "idle" ? "#fff" : "var(--ink-4)",
            cursor: input.trim() && state === "idle" ? "pointer" : "default", transition: "all 0.15s",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
        </button>
      </div>
      <p className="dash-status">{stateLabel[state]}</p>
    </section>
  );
}
