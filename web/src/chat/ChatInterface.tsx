import React, { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "motion/react";
import { ColorOrb } from "@/components/ui/ai-input";
import { speakText } from "../voice/VoiceOutput";

const chatEndpoint: string =
  (import.meta.env.VITE_CHAT_ENDPOINT as string | undefined) ??
  `${import.meta.env.VITE_VOICE_API_URL as string}/chat`;

type Message = { role: "user" | "assistant"; text: string };

export interface ChatHandle { open: () => void; }

const W = 520;
const H_OPEN = 500;
const H_CLOSED = 44;

function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
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

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p:          ({ children }) => <p style={{ margin: "0 0 0.55em", color: "var(--ink-1)", lineHeight: 1.7, fontSize: "0.88rem" }}>{children}</p>,
  ul:         ({ children }) => <ul style={{ margin: "0 0 0.55em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ul>,
  ol:         ({ children }) => <ol style={{ margin: "0 0 0.55em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ol>,
  li:         ({ children }) => <li style={{ marginBottom: "0.2em", lineHeight: 1.65, fontSize: "0.88rem", color: "var(--ink-2)" }}>{children}</li>,
  strong:     ({ children }) => <strong style={{ color: "var(--ink-1)", fontWeight: 600 }}>{children}</strong>,
  h2:         ({ children }) => <h3 style={{ fontFamily: "var(--font-display)", fontSize: "0.98rem", fontWeight: 400, color: "var(--ink-1)", margin: "0.8em 0 0.3em" }}>{children}</h3>,
  code:       ({ children }) => <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", background: "rgba(143,191,143,0.15)", padding: "0.1em 0.35em", borderRadius: "0.3em", color: "var(--green-moss)" }}>{children}</code>,
  pre:        ({ children }) => <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", background: "var(--ink-1)", color: "var(--green-fog)", padding: "0.75rem 1rem", borderRadius: 8, overflowX: "auto", margin: "0.5em 0" }}>{children}</pre>,
  blockquote: ({ children }) => <blockquote style={{ borderLeft: "2px solid var(--green-atmos)", paddingLeft: "0.8em", margin: "0.5em 0", color: "var(--ink-3)", fontStyle: "italic" }}>{children}</blockquote>,
};

type SRInstance = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } }; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void;
};

function getSR(): (new () => SRInstance) | undefined {
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as ((new () => SRInstance) | undefined);
}

export const ChatInterface = React.forwardRef<
  ChatHandle,
  { idToken?: string; userId?: string; sessionId?: string; onSessionId?: (id: string) => void }
>(function ChatInterface({ idToken, userId, sessionId, onSessionId }, ref) {
  const [isOpen, setIsOpen]           = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [isListening, setIsListening] = useState(false);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SRInstance | null>(null);
  const baseTextRef    = useRef("");

  React.useImperativeHandle(ref, () => ({
    open: () => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 250); },
  }));

  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 300); }, [isOpen]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, [input]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SR = getSR(); if (!SR) return;
    stopListening(); baseTextRef.current = input.trim();
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = "en-US";
    r.onresult = (e) => {
      let finals = ""; let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finals += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      const base = baseTextRef.current; setInput((base ? base + " " : "") + finals + interim);
    };
    r.onend = () => { setIsListening(false); recognitionRef.current = null; };
    r.onerror = (ev) => { if (ev.error !== "aborted") setIsListening(false); recognitionRef.current = null; };
    r.start(); recognitionRef.current = r; setIsListening(true);
  }, [input, stopListening]);

  const sendMessage = useCallback(async (text: string): Promise<string> => {
    const agentSessionId = sessionId ?? `s-${Date.now()}`;
    const res = await fetch(chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify({ message: text, sessionId: agentSessionId, ...(userId ? { userId } : {}) }),
    });
    const body = await res.text(); let display = body || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { response?: string; sessionId?: string; message?: string; result?: string };
      if (parsed.sessionId) onSessionId?.(parsed.sessionId);
      display = parsed.response ?? parsed.message ?? parsed.result ?? display;
    } catch { /* not JSON */ }
    return display;
  }, [idToken, userId, sessionId, onSessionId]);

  const handleSend = useCallback(async () => {
    const text = input.trim(); if (!text || loading) return;
    stopListening(); setInput(""); setMessages(prev => [...prev, { role: "user", text }]); setLoading(true);
    try {
      const response = await sendMessage(text);
      setMessages(prev => [...prev, { role: "assistant", text: response }]);
      setIsSpeaking(true);
      try { await speakText(response, idToken); } catch { /* TTS non-fatal */ }
      setIsSpeaking(false);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: e instanceof Error ? e.message : "Request failed" }]);
    } finally { setLoading(false); }
  }, [input, loading, sendMessage, idToken, stopListening]);

  const handleClose = useCallback(() => { setIsOpen(false); stopListening(); }, [stopListening]);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  return (
    <motion.div
      style={{ width: W, background: "var(--glass-light)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: "1px solid var(--glass-stroke)", boxShadow: "var(--shadow-card)", overflow: "hidden", display: "flex", flexDirection: "column" }}
      animate={{ height: isOpen ? H_OPEN : H_CLOSED, borderRadius: isOpen ? 14 : 22 }}
      transition={{ type: "spring", stiffness: 550, damping: 45, mass: 0.7 }}
    >
      {/* Header */}
      <div style={{ height: H_CLOSED, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 0 12px", borderBottom: isOpen ? "1px solid var(--glass-stroke)" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ColorOrb dimension="22px" spinDuration={isSpeaking ? 6 : 20} tones={{ base: "oklch(22% 0.04 160)", accent1: "oklch(62% 0.14 155)", accent2: "oklch(48% 0.12 162)", accent3: "oklch(55% 0.08 150)" }} />
          <button onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 200); }} disabled={loading}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)", fontSize: "0.88rem", letterSpacing: "0.01em", color: isSpeaking ? "var(--green-moss)" : "var(--ink-2)", transition: "color 0.2s" }}>
            {loading ? "thinking..." : isSpeaking ? "speaking..." : "Ask halo"}
          </button>
        </div>
        {isOpen && (
          <button onClick={handleClose} aria-label="Close chat"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, transition: "color 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3)"; }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 6px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--ink-4)" }}>
            say hello
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "82%", padding: msg.role === "assistant" ? "10px 14px" : "9px 13px", borderRadius: msg.role === "user" ? "13px 13px 3px 13px" : "13px 13px 13px 3px", background: msg.role === "user" ? "oklch(38% 0.10 155)" : "rgba(255,255,255,0.36)", border: msg.role === "assistant" ? "1px solid var(--glass-stroke)" : "none", color: msg.role === "user" ? "#fff" : "var(--ink-1)", fontFamily: "var(--font-sans)", fontSize: "0.875rem", lineHeight: 1.6, wordBreak: "break-word" }}>
              {msg.role === "assistant" ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{msg.text}</ReactMarkdown> : msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 16px", borderRadius: "13px 13px 13px 3px", background: "rgba(255,255,255,0.36)", border: "1px solid var(--glass-stroke)" }}><ThinkingDots /></div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: 0 }} />
      </div>

      {/* Input row */}
      <div style={{ flexShrink: 0, borderTop: "1px solid var(--glass-stroke)", display: "flex", alignItems: "flex-end", gap: 6, padding: "6px 8px", background: "rgba(255,255,255,0.18)" }}>
        <button type="button" onClick={isListening ? stopListening : startListening} aria-label={isListening ? "Stop" : "Voice"}
          style={{ flexShrink: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: isListening ? "1px solid oklch(55% 0.14 155)" : "1px solid var(--glass-stroke)", background: isListening ? "oklch(55% 0.14 155 / 0.12)" : "transparent", color: isListening ? "oklch(45% 0.14 155)" : "var(--ink-3)", cursor: "pointer", transition: "all 0.15s" }}>
          {isListening ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="oklch(45% 0.14 155)" stroke="none"><rect x="1" y="1" width="10" height="10" rx="2"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask halo anything..." rows={1}
          style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-sans)", fontSize: "0.9rem", color: "var(--ink-1)", lineHeight: 1.5, padding: "7px 4px", maxHeight: 80, overflowY: "auto" }} />
        <button type="button" onClick={() => void handleSend()} disabled={!input.trim() || loading} aria-label="Send"
          style={{ flexShrink: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: input.trim() && !loading ? "oklch(38% 0.10 155)" : "rgba(27,36,29,0.06)", color: input.trim() && !loading ? "#fff" : "var(--ink-4)", cursor: input.trim() && !loading ? "pointer" : "default", transition: "all 0.15s" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
    </motion.div>
  );
});
