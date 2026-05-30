// Halo — cinematic marketing landing page.
import { useState } from "react";
import { Hero } from "./Hero";
import { Capabilities, Statement, Footer } from "./Sections";
import { ChatInterface } from "../chat/ChatInterface";

function getStoredCode(): string {
  try { return localStorage.getItem("autnio_access_code") ?? ""; } catch { return ""; }
}

export function LandingPage({ onSignIn: _onSignIn }: { onSignIn: () => void }) {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [accessCode, setAccessCode] = useState(getStoredCode);
  const [savedCode, setSavedCode]   = useState(getStoredCode);

  const paired = !!savedCode;

  const handlePair = () => {
    const code = accessCode.trim().toLowerCase();
    if (!code) return;
    setSavedCode(code);
    try { localStorage.setItem("autnio_access_code", code); } catch { /* ignore */ }
  };

  const scrollToChat = () => {
    document.getElementById("chat")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Hero onScrollDown={scrollToChat} />
      <Capabilities />

      <section
        id="chat"
        style={{
          padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)",
          maxWidth: 1280,
          margin: "0 auto",
          textAlign: "center",
          scrollMarginTop: 0,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Chat
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          Everything in one place.
        </h2>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <ChatInterface userId={savedCode || undefined} sessionId={sessionId} onSessionId={setSessionId} />
        </div>

        {/* Computer connection widget */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "2rem" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.55rem 0.8rem",
            borderRadius: "0.75rem",
            border: `1px solid ${paired ? "rgba(74,179,74,0.3)" : "rgba(27,36,29,0.12)"}`,
            background: paired ? "rgba(74,179,74,0.06)" : "rgba(27,36,29,0.03)",
            transition: "border-color 0.2s, background 0.2s",
          }}>
            {/* Status dot */}
            <span style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: paired ? "var(--green-atmos, #4ab34a)" : "var(--ink-4, #aaa)",
              flexShrink: 0,
              transition: "background 0.2s",
            }} />

            {paired ? (
              <>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                  computer: {savedCode}
                </span>
                <button
                  onClick={() => { setAccessCode(""); setSavedCode(""); try { localStorage.removeItem("autnio_access_code"); } catch { /* ignore */ } }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-4)", padding: "0 0.1rem", lineHeight: 1 }}
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                <input
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePair(); }}
                  placeholder="enter access code to connect computer"
                  style={{
                    background: "none",
                    border: "none",
                    outline: "none",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    color: "var(--ink-2)",
                    letterSpacing: "0.06em",
                    width: "22ch",
                    textTransform: "lowercase",
                  }}
                />
                <button
                  onClick={handlePair}
                  disabled={!accessCode.trim()}
                  style={{
                    background: "none",
                    border: "1px solid rgba(27,36,29,0.18)",
                    borderRadius: "0.4rem",
                    cursor: accessCode.trim() ? "pointer" : "default",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.72rem",
                    color: "var(--ink-3)",
                    padding: "0.2rem 0.55rem",
                    opacity: accessCode.trim() ? 1 : 0.4,
                  }}
                >
                  pair
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <Statement />
      <Footer />
    </>
  );
}
