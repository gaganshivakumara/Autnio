import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "motion/react";
import type { MorphPanelHandle } from "@/components/ui/ai-input";

const restApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

type Message = { role: "user" | "assistant"; text: string };

const W = 520;
const H_OPEN = 480;
const H_CLOSED = 44;

export const ChatInterface = React.forwardRef<
  MorphPanelHandle,
  { idToken?: string; sessionId?: string; onSessionId?: (id: string) => void }
>(function ChatInterface({ idToken, sessionId, onSessionId }, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ onend: (() => void) | null; stop: () => void } | null>(null);
  const baseTextRef = useRef("");

  React.useImperativeHandle(ref, () => ({
    open: () => {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 250);
    },
  }));

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, [input]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SR = (window as unknown as Record<string, unknown>)["SpeechRecognition"] as (new () => {
      continuous: boolean; interimResults: boolean; lang: string;
      onresult: ((e: { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } }; resultIndex: number }) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error: string }) => void) | null;
      start(): void; stop(): void;
    }) | undefined
      ?? (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"] as (new () => {
      continuous: boolean; interimResults: boolean; lang: string;
      onresult: ((e: { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } }; resultIndex: number }) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error: string }) => void) | null;
      start(): void; stop(): void;
    }) | undefined;

    if (!SR) return;
    stopListening();
    baseTextRef.current = input.trim();

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finals += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      const base = baseTextRef.current;
      setInput((base ? base + " " : "") + finals + interim);
    };

    r.onend = () => { setIsListening(false); recognitionRef.current = null; };
    r.onerror = (ev) => { if (ev.error !== "aborted") setIsListening(false); recognitionRef.current = null; };

    r.start();
    recognitionRef.current = r;
    setIsListening(true);
  }, [input, stopListening]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    stopListening();
  }, [stopListening]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    stopListening();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch(`${restApiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ message: text, ...(sessionId ? { sessionId } : {}) }),
      });
      const raw = await res.text();
      try {
        const parsed = JSON.parse(raw) as { response?: string; sessionId?: string };
        if (parsed.sessionId) onSessionId?.(parsed.sessionId);
        setMessages(prev => [...prev, { role: "assistant", text: parsed.response ?? raw }]);
      } catch {
        setMessages(prev => [...prev, { role: "assistant", text: raw }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: e instanceof Error ? e.message : "Request failed" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, idToken, sessionId, onSessionId, stopListening]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  return (
    <motion.div
      style={{
        width: W,
        background: "var(--glass-light)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid var(--glass-stroke)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      animate={{ height: isOpen ? H_OPEN : H_CLOSED, borderRadius: isOpen ? 14 : 22 }}
      transition={{ type: "spring", stiffness: 550, damping: 45, mass: 0.7 }}
    >
      {/* ── Header pill ─────────────────────────────────────────────────── */}
      <div style={{
        height: H_CLOSED, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 8px 0 12px",
        borderBottom: isOpen ? "1px solid var(--glass-stroke)" : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            background: "radial-gradient(circle at 35% 35%, oklch(62% 0.14 155), oklch(28% 0.04 160))",
          }} />
          <button
            onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 200); }}
            disabled={loading}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontFamily: "var(--font-sans)", fontSize: "0.88rem",
              letterSpacing: "0.01em", color: "var(--ink-2)",
            }}
          >
            {loading ? "thinking…" : "Ask halo"}
          </button>
        </div>

        {isOpen && (
          <button
            onClick={handleClose}
            aria-label="Close chat"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--ink-3)", display: "flex", alignItems: "center",
              padding: 6, borderRadius: 8, transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "12px 16px 6px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-mono)", fontSize: "0.7rem",
            textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--ink-4)",
          }}>
            say hello
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "78%",
              padding: "9px 13px",
              borderRadius: msg.role === "user" ? "13px 13px 3px 13px" : "13px 13px 13px 3px",
              background: msg.role === "user" ? "oklch(38% 0.10 155)" : "rgba(255,255,255,0.36)",
              border: msg.role === "assistant" ? "1px solid var(--glass-stroke)" : "none",
              color: msg.role === "user" ? "#fff" : "var(--ink-1)",
              fontFamily: "var(--font-sans)",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "9px 16px",
              borderRadius: "13px 13px 13px 3px",
              background: "rgba(255,255,255,0.36)",
              border: "1px solid var(--glass-stroke)",
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.95rem",
              letterSpacing: "0.18em",
            }}>
              · · ·
            </div>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 0 }} />
      </div>

      {/* ── Input row ───────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderTop: "1px solid var(--glass-stroke)",
        display: "flex", alignItems: "flex-end", gap: 6,
        padding: "6px 8px",
        background: "rgba(255,255,255,0.18)",
      }}>
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          aria-label={isListening ? "Stop listening" : "Voice input"}
          style={{
            flexShrink: 0, width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8,
            border: isListening ? "1px solid oklch(55% 0.14 155)" : "1px solid var(--glass-stroke)",
            background: isListening ? "oklch(55% 0.14 155 / 0.12)" : "transparent",
            color: isListening ? "oklch(45% 0.14 155)" : "var(--ink-3)",
            cursor: "pointer", transition: "all 0.15s",
          }}
        >
          {isListening ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="oklch(45% 0.14 155)" stroke="none">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>

        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask halo anything…"
          rows={1}
          style={{
            flex: 1, resize: "none",
            background: "transparent", border: "none", outline: "none",
            fontFamily: "var(--font-sans)", fontSize: "0.9rem",
            color: "var(--ink-1)", lineHeight: 1.5,
            padding: "7px 4px", maxHeight: 80, overflowY: "auto",
          }}
        />

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!input.trim() || loading}
          aria-label="Send"
          style={{
            flexShrink: 0, width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8, border: "none",
            background: input.trim() && !loading ? "oklch(38% 0.10 155)" : "rgba(27,36,29,0.06)",
            color: input.trim() && !loading ? "#fff" : "var(--ink-4)",
            cursor: input.trim() && !loading ? "pointer" : "default",
            transition: "all 0.15s",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"/>
            <polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>
    </motion.div>
  );
});
