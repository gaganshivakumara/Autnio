// Halo — cinematic marketing landing page.
import { useRef, useState } from "react";
import { Hero } from "./Hero";
import { Capabilities, Statement, Footer } from "./Sections";
import { SiteNav } from "./SiteNav";
import { ChatInterface } from "../chat/ChatInterface";
import { CameraFeed } from "../vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "../vision/visionApi";
import { discoverFromFrame } from "../vision/productDiscovery";
import { speakText } from "../voice/VoiceOutput";
import { FileBrowser } from "../files/FileBrowser";
import { startRelay, type RelayStatus } from "../relay/OIRelay";
import { Button } from "./Primitives";

const wsEndpoint = import.meta.env.VITE_WS_API_URL as string;

export function LandingPage({ onSignIn: _onSignIn }: { onSignIn: () => void }) {
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [relayLog, setRelayLog] = useState<string[]>([]);
  const [visionMode, setVisionMode] = useState<VisionMode>("detect");
  const [visionPrompt, setVisionPrompt] = useState("Describe the scene and identify important objects.");
  const [visionResult, setVisionResult] = useState("");
  const [visionBusy, setVisionBusy] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState("");
  const [productSessionId, setProductSessionId] = useState<string | undefined>(undefined);
  const relayRef = useRef<WebSocket | null>(null);
  const discoveryCaptureRef = useRef<(() => void) | null>(null);

  const scrollToTools = () => {
    document.getElementById("chat")?.scrollIntoView({ behavior: "smooth" });
  };

  const connectRelay = (): void => {
    relayRef.current?.close();
    relayRef.current = startRelay({
      wsEndpoint,
      onEvent: (event) => {
        if (event.type === "status") setRelayStatus(event.status);
        if (event.type === "log") setRelayLog((prev) => [...prev, event.message]);
      },
    });
  };

  const handleFrame = async (blob: Blob): Promise<void> => {
    setVisionBusy(true);
    setVisionResult("");
    try {
      const upload = await uploadFrame(blob, "anonymous");
      const result = await analyzeFrame({
        imageS3Key: upload.imageS3Key,
        mode: visionMode,
        prompt: visionPrompt,
      });
      setVisionResult(result.result);
      await speakText(result.result);
    } catch (error) {
      setVisionResult(error instanceof Error ? error.message : "Vision request failed");
    } finally {
      setVisionBusy(false);
    }
  };

  const handleDiscoveryFrame = async (blob: Blob): Promise<void> => {
    setDiscoveryStatus("Looking…");
    const productSession = `product-${crypto.randomUUID()}`;
    setProductSessionId(productSession);
    try {
      await discoverFromFrame(blob, {
        sessionId: productSession,
        onProgress: (stage, detail) => {
          if (stage === "identifying") setDiscoveryStatus("Identifying what you're looking at…");
          else if (stage === "scraping") setDiscoveryStatus(`Researching: ${detail ?? ""}…`);
          else if (stage === "done") setDiscoveryStatus(`Done — ${detail ?? ""}. Ask a follow-up in Chat.`);
          else if (stage === "error") setDiscoveryStatus(detail ?? "Discovery failed");
        },
      });
    } catch {
      // status already set via onProgress
    }
  };

  // Shared scroll-offset for fixed nav (56px)
  const sectionStyle = {
    padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)",
    maxWidth: 1280,
    margin: "0 auto",
    scrollMarginTop: 56,
  } as React.CSSProperties;

  return (
    <>
      <SiteNav />

      {/* Hero sits below the fixed nav */}
      <div style={{ paddingTop: 56 }}>
        <Hero onScrollDown={scrollToTools} />
      </div>

      <Capabilities />

      {/* ── Everything in one place — Chat ─────────────────────────── */}
      <section id="chat" style={{ ...sectionStyle, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Chat
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          Everything in one place.
        </h2>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <ChatInterface sessionId={productSessionId} onSessionId={setProductSessionId} />
          <div style={{ width: "100%" }}><FileBrowser /></div>
        </div>
      </section>

      {/* ── Vision Feed ────────────────────────────────────────────── */}
      <section id="vision-feed" style={sectionStyle}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Vision Feed
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "2.5rem", marginTop: 0 }}>
          See what you see.
        </h2>
        <section className="dash-card">
          <div className="dash-grid">
            <select value={visionMode} onChange={(e) => setVisionMode(e.target.value as VisionMode)} className="dash-input">
              <option value="detect">detect — Qwen3-VL-235B</option>
              <option value="stream">stream — Nemotron Nano 2 VL</option>
            </select>
            <input value={visionPrompt} onChange={(e) => setVisionPrompt(e.target.value)} className="dash-input" />
          </div>
          <CameraFeed onFrame={handleFrame} />
          <pre className="dash-pre">
            {visionBusy ? "Analyzing..." : visionResult || "Capture a frame to analyze."}
          </pre>
        </section>
      </section>

      {/* ── Product Discovery ──────────────────────────────────────── */}
      <section id="product-discovery" style={sectionStyle}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Product Discovery
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "1rem", marginTop: 0 }}>
          Point. Discover. Ask.
        </h2>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.98rem", color: "var(--ink-3)", lineHeight: 1.65, marginBottom: "2.5rem", maxWidth: "52ch" }}>
          Point your camera at any product. halo identifies it, scrapes Amazon reviews, and reads back a summary — then continue the conversation in Chat.
        </p>
        <section className="dash-card">
          <CameraFeed
            onFrame={handleDiscoveryFrame}
            captureLabel="Discover Product"
            registerCapture={(fn) => { discoveryCaptureRef.current = fn; }}
          />
          {discoveryStatus && <pre className="dash-pre">{discoveryStatus}</pre>}
        </section>
      </section>

      {/* ── Open Interpreter Relay ─────────────────────────────────── */}
      <section id="relay" style={sectionStyle}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Open Interpreter Relay
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "2.5rem", marginTop: 0 }}>
          Run it on your machine.
        </h2>
        <section className="dash-card">
          <div className="dash-relay-status">
            <span className="dash-user-dot" style={{ background: relayStatus === "connected" ? "var(--green-atmos)" : relayStatus === "error" ? "#b42318" : "var(--ink-4)" }} />
            <span className="dash-status">{relayStatus}</span>
          </div>
          <Button variant="primary" onClick={connectRelay} style={{ fontSize: "0.88rem", padding: "0.7rem 1.4rem" }}>
            Connect Relay
          </Button>
          <pre className="dash-pre">
            {relayLog.length ? relayLog.join("\n") : "Waiting for WebSocket endpoint."}
          </pre>
        </section>
      </section>

      <Statement />
      <Footer />
    </>
  );
}
