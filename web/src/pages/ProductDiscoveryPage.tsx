import { useRef, useState } from "react";
import { SiteNav } from "../landing/SiteNav";
import { CameraFeed } from "../vision/CameraFeed";
import { discoverFromFrame } from "../vision/productDiscovery";
import { ChatInterface } from "../chat/ChatInterface";

export function ProductDiscoveryPage() {
  const [discoveryStatus, setDiscoveryStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const captureRef = useRef<(() => void) | null>(null);

  const handleDiscoveryFrame = async (blob: Blob): Promise<void> => {
    setDiscoveryStatus("Looking…");
    const productSession = `product-${crypto.randomUUID()}`;
    setSessionId(productSession);
    try {
      await discoverFromFrame(blob, {
        sessionId: productSession,
        onProgress: (stage, detail) => {
          if (stage === "identifying") setDiscoveryStatus("Identifying what you're looking at…");
          else if (stage === "scraping") setDiscoveryStatus(`Researching: ${detail ?? ""}…`);
          else if (stage === "done") setDiscoveryStatus(`Done — ${detail ?? ""}. Ask a follow-up below.`);
          else if (stage === "error") setDiscoveryStatus(detail ?? "Discovery failed");
        },
      });
    } catch {
      // status set via onProgress
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sky-low)" }}>
      <div style={{ position: "relative", height: 56 }}>
        <SiteNav />
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(3rem, 8vh, 6rem) clamp(1.5rem, 6vw, 6rem)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Product Discovery
        </div>
        <h1 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "1rem", marginTop: 0 }}>
          Point. Discover. Ask.
        </h1>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.98rem", color: "var(--ink-3)", lineHeight: 1.65, marginBottom: "3rem", maxWidth: "52ch" }}>
          Point your camera at any product. halo identifies it, scrapes Amazon reviews, and reads back a summary — then ask follow-up questions below.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <section className="dash-card">
            <CameraFeed
              onFrame={handleDiscoveryFrame}
              captureLabel="Discover Product"
              registerCapture={(fn) => { captureRef.current = fn; }}
            />
            {discoveryStatus && <pre className="dash-pre">{discoveryStatus}</pre>}
          </section>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <ChatInterface sessionId={sessionId} onSessionId={setSessionId} />
          </div>
        </div>
      </main>
    </div>
  );
}
