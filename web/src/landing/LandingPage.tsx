import { useRef, useState, useEffect, useCallback } from "react";
import { Hero } from "./Hero";
import { Capabilities, Statement, Footer } from "./Sections";
import { ChatInterface, type ChatHandle } from "../chat/ChatInterface";
import { CameraFeed } from "../vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "../vision/visionApi";
import { speakText } from "../voice/VoiceOutput";
import { useWakeWord } from "../voice/useWakeWord";

function getStoredCode(): string {
  try { return localStorage.getItem("autnio_access_code") ?? ""; } catch { return ""; }
}

export function LandingPage({ onSignIn: _onSignIn }: { onSignIn: () => void }) {
  const [sessionId, setSessionId]   = useState<string | undefined>(undefined);
  const [accessCode, setAccessCode] = useState(getStoredCode);
  const [savedCode, setSavedCode]   = useState(getStoredCode);

  const [visionMode,   setVisionMode]   = useState<VisionMode>("detect");
  const [visionPrompt, setVisionPrompt] = useState("Describe the scene and identify important objects.");
  const [visionResult, setVisionResult] = useState("");
  const [visionBusy,   setVisionBusy]   = useState(false);

  const morphRef      = useRef<ChatHandle>(null);
  const [chatInView, setChatInView] = useState(false);

  useEffect(() => {
    const section = document.getElementById("voice");
    if (!section) return;
    const obs = new IntersectionObserver(([entry]) => setChatInView(entry.isIntersecting), { threshold: 0.25 });
    obs.observe(section);
    return () => obs.disconnect();
  }, []);

  const handleWakeWord = useCallback(() => { morphRef.current?.open(); }, []);
  useWakeWord(handleWakeWord, chatInView);

  const handleFrame = async (blob: Blob): Promise<void> => {
    setVisionBusy(true); setVisionResult("");
    try {
      const upload = await uploadFrame(blob, savedCode || "anonymous");
      const result = await analyzeFrame({ imageS3Key: upload.imageS3Key, mode: visionMode, prompt: visionPrompt });
      setVisionResult(result.result);
      await speakText(result.result);
    } catch (error) {
      setVisionResult(error instanceof Error ? error.message : "Vision request failed");
    } finally { setVisionBusy(false); }
  };

  const paired = !!savedCode;

  const handlePair = () => {
    const code = accessCode.trim().toLowerCase();
    if (!code) return;
    setSavedCode(code);
    try { localStorage.setItem("autnio_access_code", code); } catch { /* ignore */ }
  };

  const scrollToChat = () => {
    document.getElementById("voice")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Hero onScrollDown={scrollToChat} />
      <Capabilities />

      <section id="voice" style={{ padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)", maxWidth: 1280, margin: "0 auto", textAlign: "center", scrollMarginTop: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Voice
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          Everything in one place.
        </h2>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <ChatInterface ref={morphRef} userId={savedCode || undefined} sessionId={sessionId} onSessionId={setSessionId} />
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.55rem 0.8rem", borderRadius: "0.75rem", border: `1px solid ${paired ? "rgba(74,179,74,0.3)" : "rgba(27,36,29,0.12)"}`, background: paired ? "rgba(74,179,74,0.06)" : "rgba(27,36,29,0.03)", transition: "border-color 0.2s, background 0.2s" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: paired ? "var(--green-atmos, #4ab34a)" : "var(--ink-4, #aaa)", flexShrink: 0, transition: "background 0.2s" }} />
            {paired ? (
              <>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-3)", letterSpacing: "0.04em" }}>computer: {savedCode}</span>
                <button onClick={() => { setAccessCode(""); setSavedCode(""); try { localStorage.removeItem("autnio_access_code"); } catch { /* ignore */ } }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-4)", padding: "0 0.1rem", lineHeight: 1 }}>
                  x
                </button>
              </>
            ) : (
              <>
                <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handlePair(); }}
                  placeholder="enter access code to connect computer"
                  style={{ background: "none", border: "none", outline: "none", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-2)", letterSpacing: "0.06em", width: "22ch", textTransform: "lowercase" }} />
                <button onClick={handlePair} disabled={!accessCode.trim()}
                  style={{ background: "none", border: "1px solid rgba(27,36,29,0.18)", borderRadius: "0.4rem", cursor: accessCode.trim() ? "pointer" : "default", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-3)", padding: "0.2rem 0.55rem", opacity: accessCode.trim() ? 1 : 0.4 }}>
                  pair
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section id="vision" style={{ padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)", maxWidth: 1280, margin: "0 auto", textAlign: "center", scrollMarginTop: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Vision Feed
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          See what you see.
        </h2>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <select value={visionMode} onChange={(e) => setVisionMode(e.target.value as VisionMode)} className="dash-input" style={{ flex: 1 }}>
              <option value="detect">detect — Qwen3-VL-235B</option>
              <option value="stream">stream — Nemotron Nano 2 VL</option>
            </select>
            <input value={visionPrompt} onChange={(e) => setVisionPrompt(e.target.value)} className="dash-input" style={{ flex: 2 }} placeholder="Describe what to look for..." />
          </div>
          <CameraFeed onFrame={handleFrame} captureLabel={visionBusy ? "Analyzing..." : "Analyze Scene"} />
          {visionResult && <pre className="dash-pre" style={{ marginTop: "1rem", textAlign: "left" }}>{visionResult}</pre>}
        </div>
      </section>

      <Statement />
      <Footer />
    </>
  );
}
