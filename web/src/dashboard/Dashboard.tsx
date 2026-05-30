// Halo — App dashboard. All existing backend integrations, restyled.
import { useRef, useState } from "react";
import { ChatInterface } from "../chat/ChatInterface";
import { FileBrowser } from "../files/FileBrowser";
import { startRelay, type RelayStatus } from "../relay/OIRelay";
import { CameraFeed } from "../vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "../vision/visionApi";
import { speakText } from "../voice/VoiceOutput";
import { Button, RingMark } from "../landing/Primitives";

const wsEndpoint = import.meta.env.VITE_WS_API_URL as string;

export function Dashboard({ onBack }: { onBack: () => void }) {
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [relayLog, setRelayLog] = useState<string[]>([]);
  const [visionMode, setVisionMode] = useState<VisionMode>("detect");
  const [visionPrompt, setVisionPrompt] = useState("Describe the scene and identify important objects.");
  const [visionResult, setVisionResult] = useState("");
  const [visionBusy, setVisionBusy] = useState(false);
  const relayRef = useRef<WebSocket | null>(null);

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
    <div className="dashboard">
      {/* Top bar */}
      <nav className="dash-nav">
        <button type="button" className="dash-back" onClick={onBack} aria-label="Back to home">
          <RingMark size={22} stroke="var(--ink-1)" />
          <span className="dash-wordmark">halo</span>
        </button>
      </nav>

      <main className="dash-content">
        {/* Chat */}
        <ChatInterface />

        {/* Relay */}
        <section className="dash-card" id="relay-section">
          <h2 className="dash-card-title">Open Interpreter Relay</h2>
          <div className="dash-relay-status">
            <span className="dash-user-dot" style={{
              background: relayStatus === "connected" ? "var(--green-atmos)" : relayStatus === "error" ? "#b42318" : "var(--ink-4)",
            }} />
            <span className="dash-status">{relayStatus}</span>
          </div>
          <Button variant="primary" onClick={connectRelay} style={{ fontSize: "0.88rem", padding: "0.7rem 1.4rem" }}>
            Connect Relay
          </Button>
          <pre className="dash-pre">{relayLog.length ? relayLog.join("\n") : "Waiting for WebSocket endpoint."}</pre>
        </section>

        {/* Vision */}
        <section className="dash-card" id="vision-section">
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
          <pre className="dash-pre">{visionBusy ? "Analyzing..." : visionResult || "Capture a frame to analyze."}</pre>
        </section>

        {/* Files */}
        <FileBrowser />
      </main>
    </div>
  );
}
