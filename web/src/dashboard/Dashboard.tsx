// Halo — App dashboard. All existing backend integrations, restyled.
import { useRef, useState } from "react";
import { ChatInterface } from "../chat/ChatInterface";
import { FileBrowser } from "../files/FileBrowser";
import { CameraFeed } from "../vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "../vision/visionApi";
import { discoverFromFrame } from "../vision/productDiscovery";
import { speakText } from "../voice/VoiceOutput";
import { recordAndTranscribe } from "../voice/VoiceInput";
import { isCaptureCommand } from "../voice/commands";
import { Button, RingMark } from "../landing/Primitives";

export function Dashboard({ onBack }: { onBack: () => void }) {
  // Computer pairing — pre-fill from localStorage; user must click Pair to activate
  const storedCode = typeof localStorage !== "undefined"
    ? (localStorage.getItem("autnio_access_code") ?? "")
    : "";
  const [accessCode, setAccessCode] = useState(storedCode);
  const [savedCode, setSavedCode]   = useState(storedCode);

  // Vision / product discovery
  const [visionMode,   setVisionMode]   = useState<VisionMode>("detect");
  const [visionPrompt, setVisionPrompt] = useState("Describe the scene and identify important objects.");
  const [visionResult, setVisionResult] = useState("");
  const [visionBusy,   setVisionBusy]   = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState("");

  // One Bedrock session per product: a capture mints a fresh id, follow-up
  // questions reuse it, and the next capture rotates it — so reviews/descriptions
  // never bleed across products.
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const captureRef = useRef<(() => void) | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  const pairCode = accessCode.trim().toLowerCase();
  const isPaired = !!savedCode;

  const handlePair = (): void => {
    if (!pairCode) return;
    setSavedCode(pairCode);
    localStorage.setItem("autnio_access_code", pairCode);
  };

  const handleFrame = async (blob: Blob): Promise<void> => {
    setVisionBusy(true);
    setVisionResult("");
    try {
      const upload = await uploadFrame(blob, savedCode || "anonymous");
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
      // status already reflected via onProgress
    }
  };

  // Hands-free entry: record a command; if it's a capture intent, fire the shutter.
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
        {isPaired && (
          <div className="dash-nav-right">
            <span className="dash-user-dot" style={{ background: "var(--green-atmos)" }} />
            <span className="dash-status">computer: {savedCode}</span>
          </div>
        )}
      </nav>

      <main className="dash-content">
        {/* Chat — sessionId shared with product discovery so follow-up questions work */}
        <ChatInterface
          userId={savedCode || undefined}
          sessionId={sessionId}
          onSessionId={setSessionId}
        />

        {/* Computer pairing */}
        <section className="dash-card" id="relay-section">
          <h2 className="dash-card-title">Connect Computer</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--ink-3)", margin: "0 0 1rem" }}>
            Run <code style={{ fontSize: "0.82rem" }}>.venv/bin/python computer-use/scripts/run-agent.py</code> on the
            target machine, then enter the printed access code below.
          </p>
          <div className="dash-grid">
            <input
              ref={inputRef}
              className="dash-input"
              placeholder="access code (e.g. ax7k2m)"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handlePair(); }}
              style={{ letterSpacing: "0.1em", textTransform: "lowercase" }}
            />
            <Button
              variant="primary"
              onClick={handlePair}
              style={{ fontSize: "0.88rem", padding: "0.7rem 1.4rem" }}
              disabled={!pairCode}
            >
              {isPaired ? "Update" : "Pair"}
            </Button>
          </div>
          {isPaired && (
            <pre className="dash-pre" style={{ marginTop: "0.75rem" }}>
              {`Paired with computer: ${savedCode}\nTasks sent via chat will run on that machine.`}
            </pre>
          )}
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
            Point the camera and say "take a picture", or tap capture. Autnio describes the
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
