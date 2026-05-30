// Halo — App dashboard. All existing backend integrations, restyled.
import { useRef, useState } from "react";
import { ChatInterface } from "../chat/ChatInterface";
import { FileBrowser } from "../files/FileBrowser";
import { startRelay, type RelayStatus } from "../relay/OIRelay";
import { CameraFeed } from "../vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "../vision/visionApi";
import { discoverFromFrame } from "../vision/productDiscovery";
import { speakText } from "../voice/VoiceOutput";
import { recordAndTranscribe } from "../voice/VoiceInput";
import { isCaptureCommand } from "../voice/commands";
import { Button, RingMark } from "../landing/Primitives";

const wsEndpoint = import.meta.env.VITE_WS_API_URL as string;

export function Dashboard({ onBack }: { onBack: () => void }) {
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [relayLog, setRelayLog] = useState<string[]>([]);
  const [visionMode, setVisionMode] = useState<VisionMode>("detect");
  const [visionPrompt, setVisionPrompt] = useState("Describe the scene and identify important objects.");
  const [visionResult, setVisionResult] = useState("");
  const [visionBusy, setVisionBusy] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState("");
  // One Bedrock session per product: a capture mints a fresh id, follow-up
  // questions reuse it, and the next capture rotates it — so reviews/descriptions
  // never bleed across products. Undefined means "let the backend mint one".
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const relayRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<(() => void) | null>(null);

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

  // Camera → vision → Apify discovery → spoken answer. Triggered by the capture
  // button or by a "take a picture" voice command.
  const handleDiscoveryFrame = async (blob: Blob): Promise<void> => {
    setDiscoveryStatus("Looking…");
    // Rotate to a fresh session for this product so its data starts clean.
    const productSession = `product-${crypto.randomUUID()}`;
    setSessionId(productSession);
    try {
      const { identification } = await discoverFromFrame(blob, {
        sessionId: productSession,
        onProgress: (stage, detail) => {
          if (stage === "identifying") setDiscoveryStatus("Identifying what you're looking at…");
          else if (stage === "scraping") setDiscoveryStatus(`Researching: ${detail ?? ""}`);
          else if (stage === "done") setDiscoveryStatus(`Done — ${detail ?? ""}. Ask a follow-up question anytime.`);
          else if (stage === "error") setDiscoveryStatus(detail ?? "Discovery failed");
        },
      });
      void identification;
    } catch {
      // status already reflects the error via onProgress
    }
  };

  // Hands-free entry point: record a command; if it's a capture intent, fire the shutter.
  const handleVoiceCapture = async (): Promise<void> => {
    setDiscoveryStatus("Listening…");
    try {
      const transcript = await recordAndTranscribe("");
      if (!isCaptureCommand(transcript)) {
        setDiscoveryStatus(`Heard "${transcript}" — say e.g. "take a picture" or "what is this".`);
        return;
      }
      captureRef.current?.();
    } catch (error) {
      setDiscoveryStatus(error instanceof Error ? error.message : "Voice capture failed");
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
        <ChatInterface sessionId={sessionId} onSessionId={setSessionId} />

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

        {/* Product Discovery */}
        <section className="dash-card" id="discovery-section">
          <h2 className="dash-card-title">Product Discovery</h2>
          <p className="dash-status">
            Point the camera and say “take a picture”, or tap capture. Autnio describes the
            product in a few words, searches Amazon, scrapes the top result, and reads back a summary.
          </p>
          <Button variant="primary" onClick={handleVoiceCapture} style={{ fontSize: "0.88rem", padding: "0.7rem 1.4rem" }}>
            Voice command
          </Button>
          <CameraFeed
            onFrame={handleDiscoveryFrame}
            registerCapture={(capture) => { captureRef.current = capture; }}
            captureLabel="Find this product"
          />
          <pre className="dash-pre">{discoveryStatus || "Ready. Capture a product to discover it on Amazon."}</pre>
        </section>

        {/* Files */}
        <FileBrowser />
      </main>
    </div>
  );
}
