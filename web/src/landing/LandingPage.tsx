// Halo — cinematic marketing landing page.
import { useRef, useState } from "react";
import { Hero } from "./Hero";
import { Capabilities, Statement, Footer } from "./Sections";
import { ChatInterface } from "../chat/ChatInterface";
import { CameraFeed } from "../vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "../vision/visionApi";
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
  const relayRef = useRef<WebSocket | null>(null);

  const scrollToTools = () => {
    document.getElementById("tools-section")?.scrollIntoView({ behavior: "smooth" });
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

  return (
    <>
      <Hero onScrollDown={scrollToTools} />
      <Capabilities />

      <section
        id="tools-section"
        style={{
          padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)",
          maxWidth: 1280,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 400,
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.32em",
            color: "var(--ink-3)",
            marginBottom: "1.4rem",
          }}
        >
          Features
        </div>
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 300,
            fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
            lineHeight: 1.04,
            letterSpacing: "-0.015em",
            color: "var(--ink-1)",
            marginBottom: "3.5rem",
            marginTop: 0,
          }}
        >
          Everything in one place.
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", alignItems: "center" }}>
          <ChatInterface />

          <section className="dash-card" style={{ width: "100%" }}>
            <h2 className="dash-card-title">Vision Feed</h2>
            <div className="dash-grid">
              <select
                value={visionMode}
                onChange={(e) => setVisionMode(e.target.value as VisionMode)}
                className="dash-input"
              >
                <option value="detect">detect — Qwen3-VL-235B</option>
                <option value="stream">stream — Nemotron Nano 2 VL</option>
              </select>
              <input
                value={visionPrompt}
                onChange={(e) => setVisionPrompt(e.target.value)}
                className="dash-input"
              />
            </div>
            <CameraFeed onFrame={handleFrame} />
            <pre className="dash-pre">
              {visionBusy ? "Analyzing..." : visionResult || "Capture a frame to analyze."}
            </pre>
          </section>

          <section className="dash-card" style={{ width: "100%" }}>
            <h2 className="dash-card-title">Open Interpreter Relay</h2>
            <div className="dash-relay-status">
              <span
                className="dash-user-dot"
                style={{
                  background:
                    relayStatus === "connected"
                      ? "var(--green-atmos)"
                      : relayStatus === "error"
                        ? "#b42318"
                        : "var(--ink-4)",
                }}
              />
              <span className="dash-status">{relayStatus}</span>
            </div>
            <Button
              variant="primary"
              onClick={connectRelay}
              style={{ fontSize: "0.88rem", padding: "0.7rem 1.4rem" }}
            >
              Connect Relay
            </Button>
            <pre className="dash-pre">
              {relayLog.length ? relayLog.join("\n") : "Waiting for WebSocket endpoint."}
            </pre>
          </section>

          <div style={{ width: "100%" }}><FileBrowser /></div>
        </div>
      </section>

      <Statement />
      <Footer />
    </>
  );
}
