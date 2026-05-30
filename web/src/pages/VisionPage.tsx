import { useState } from "react";
import { SiteNav } from "../landing/SiteNav";
import { CameraFeed } from "../vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "../vision/visionApi";
import { speakText } from "../voice/VoiceOutput";

export function VisionPage() {
  const [visionMode, setVisionMode] = useState<VisionMode>("detect");
  const [visionPrompt, setVisionPrompt] = useState("Describe the scene and identify important objects.");
  const [visionResult, setVisionResult] = useState("");
  const [visionBusy, setVisionBusy] = useState(false);

  const handleFrame = async (blob: Blob): Promise<void> => {
    setVisionBusy(true);
    setVisionResult("");
    try {
      const upload = await uploadFrame(blob, "anonymous");
      const result = await analyzeFrame({ imageS3Key: upload.imageS3Key, mode: visionMode, prompt: visionPrompt });
      setVisionResult(result.result);
      await speakText(result.result);
    } catch (error) {
      setVisionResult(error instanceof Error ? error.message : "Vision request failed");
    } finally {
      setVisionBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sky-low)" }}>
      <div style={{ position: "relative", height: 56 }}>
        <SiteNav />
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(3rem, 8vh, 6rem) clamp(1.5rem, 6vw, 6rem)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Vision Feed
        </div>
        <h1 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          See what you see.
        </h1>

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
      </main>
    </div>
  );
}
