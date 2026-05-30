import { useRef, useState } from "react";
import { SiteNav } from "../landing/SiteNav";
import { startRelay, type RelayStatus } from "../relay/OIRelay";
import type { RelayEvent } from "../relay/types";
import { Button } from "../landing/Primitives";
import { OIRelay } from "../relay/OIRelay";

const wsEndpoint = import.meta.env.VITE_WS_API_URL as string;

export function RelayPage() {
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [relayLog, setRelayLog] = useState<string[]>([]);
  const relayRef = useRef<OIRelay | null>(null);

  const connectRelay = (): void => {
    relayRef.current?.disconnect();
    relayRef.current = startRelay({
      wsEndpoint,
      onEvent: (event: RelayEvent) => {
        if (event.type === "status") setRelayStatus(event.status);
        if (event.type === "log") setRelayLog((prev) => [...prev, event.message]);
      },
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sky-low)" }}>
      <div style={{ position: "relative", height: 56 }}>
        <SiteNav />
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(3rem, 8vh, 6rem) clamp(1.5rem, 6vw, 6rem)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Computer Relay
        </div>
        <h1 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          Run it on your machine.
        </h1>

        <section className="dash-card">
          <div className="dash-relay-status">
            <span
              className="dash-user-dot"
              style={{ background: relayStatus === "connected" ? "var(--green-atmos)" : relayStatus === "error" ? "#b42318" : "var(--ink-4)" }}
            />
            <span className="dash-status">{relayStatus}</span>
          </div>
          <Button variant="primary" onClick={connectRelay} style={{ fontSize: "0.88rem", padding: "0.7rem 1.4rem" }}>
            Connect Relay
          </Button>
          <pre className="dash-pre">
            {relayLog.length ? relayLog.join("\n") : "Waiting for WebSocket endpoint."}
          </pre>
        </section>
      </main>
    </div>
  );
}
