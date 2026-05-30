import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteNav } from "../landing/SiteNav";
import { CameraFeed } from "../vision/CameraFeed";
import { ProductChat } from "./ProductChat";
import { discoverFromFrame, type DiscoveryResult } from "../vision/productDiscovery";

// ── Website suggestions from the identified product name ────────────────────

function productLinks(query: string) {
  const q = encodeURIComponent(query);
  return [
    { label: "Amazon",          url: `https://www.amazon.com/s?k=${q}`,                             icon: "🛒" },
    { label: "Google Shopping", url: `https://www.google.com/search?tbm=shop&q=${q}`,               icon: "🔍" },
    { label: "Best Buy",        url: `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`,          icon: "🏪" },
    { label: "Walmart",         url: `https://www.walmart.com/search?q=${q}`,                        icon: "🛍️" },
  ];
}

// ── Markdown style map (matches ChatInterface) ──────────────────────────────

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p:          ({ children }) => <p style={{ margin: "0 0 0.55em", color: "var(--ink-1)", lineHeight: 1.7, fontSize: "0.9rem" }}>{children}</p>,
  ul:         ({ children }) => <ul style={{ margin: "0 0 0.55em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ul>,
  ol:         ({ children }) => <ol style={{ margin: "0 0 0.55em", paddingLeft: "1.2em", color: "var(--ink-2)" }}>{children}</ol>,
  li:         ({ children }) => <li style={{ marginBottom: "0.2em", lineHeight: 1.65, fontSize: "0.9rem", color: "var(--ink-2)" }}>{children}</li>,
  strong:     ({ children }) => <strong style={{ color: "var(--ink-1)", fontWeight: 600 }}>{children}</strong>,
  a:          ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green-moss)", textDecoration: "underline" }}>{children}</a>,
  code:       ({ children }) => <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", background: "rgba(143,191,143,0.15)", padding: "0.1em 0.35em", borderRadius: "0.3em", color: "var(--green-moss)" }}>{children}</code>,
};

import React from "react";

// ── Status banner shown during scan ─────────────────────────────────────────

type ScanState = "idle" | "scanning" | "done" | "error";

function StatusBanner({ state, text }: { state: ScanState; text: string }) {
  if (state === "idle") return null;
  const color = state === "error" ? "var(--ink-3)" : "var(--green-moss)";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "0.6rem 0.9rem",
      borderRadius: 10,
      background: "rgba(143,191,143,0.08)",
      border: "1px solid rgba(143,191,143,0.18)",
      fontFamily: "var(--font-mono)", fontSize: "0.72rem",
      textTransform: "uppercase", letterSpacing: "0.18em", color,
    }}>
      {state === "scanning" && (
        <span style={{
          display: "inline-block", width: 7, height: 7, borderRadius: "50%",
          background: "var(--green-moss)",
          animation: "pulse 1.2s ease-in-out infinite",
        }} />
      )}
      {text}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function ProductDiscoveryPage() {
  const [scanState, setScanState]     = useState<ScanState>("idle");
  const [statusText, setStatusText]   = useState("");
  const [result, setResult]           = useState<DiscoveryResult | null>(null);
  const [sessionId, setSessionId]     = useState<string | undefined>(undefined);
  const captureRef = useRef<(() => void) | null>(null);

  const handleDiscoveryFrame = async (blob: Blob): Promise<void> => {
    setScanState("scanning");
    setStatusText("Looking…");
    setResult(null);
    const productSession = `product-${crypto.randomUUID()}`;
    setSessionId(productSession);

    try {
      const discovered = await discoverFromFrame(blob, {
        sessionId: productSession,
        onProgress: (stage, detail) => {
          if (stage === "capturing")    setStatusText("Got it — looking at that now…");
          else if (stage === "identifying") setStatusText("Identifying what you're looking at…");
          else if (stage === "scraping")    setStatusText(`Researching ${detail ?? ""}…`);
          else if (stage === "done")        setStatusText(`Found: ${detail ?? ""}`);
          else if (stage === "error")       { setScanState("error"); setStatusText(detail ?? "Discovery failed"); }
        },
      });
      setResult(discovered);
      setScanState("done");
    } catch {
      setScanState("error");
      setStatusText("Discovery failed — try again.");
    }
  };

  return (
    <>
      {/* Pulse keyframe */}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      <div style={{ minHeight: "100vh", background: "var(--sky-low)" }}>
        <div style={{ position: "relative", height: 56 }}>
          <SiteNav />
        </div>

        <main style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(3rem, 8vh, 6rem) clamp(1.5rem, 6vw, 4rem)" }}>
          {/* Header */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
            Product Discovery
          </div>
          <h1 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "0.8rem", marginTop: 0 }}>
            Point. Discover. Ask.
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.95rem", color: "var(--ink-3)", lineHeight: 1.65, marginBottom: "2.5rem", maxWidth: "52ch" }}>
            Point your camera at any product. halo identifies it, scrapes reviews, and reads back a summary — then ask follow-up questions below.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* ── Camera card ─────────────────────────────────────────── */}
            <section className="dash-card">
              <CameraFeed
                onFrame={handleDiscoveryFrame}
                captureLabel={scanState === "scanning" ? "Scanning…" : "Discover Product"}
                registerCapture={(fn) => { captureRef.current = fn; }}
              />
              {scanState !== "idle" && (
                <div style={{ marginTop: "0.75rem" }}>
                  <StatusBanner state={scanState} text={statusText} />
                </div>
              )}
            </section>

            {/* ── Product result card ─────────────────────────────────── */}
            {result && (
              <section className="dash-card" style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                {/* Label row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.28em", color: "var(--green-moss)" }}>
                    halo found
                  </div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.82rem", color: "var(--ink-3)", fontStyle: "italic" }}>
                    {result.identification}
                  </div>
                </div>

                {/* Agent's spoken description */}
                <div style={{
                  padding: "1rem 1.2rem",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.55)",
                  border: "1px solid var(--glass-stroke)",
                  fontFamily: "var(--font-sans)",
                }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {result.answer}
                  </ReactMarkdown>
                </div>

                {/* Website suggestion links */}
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--ink-4)", marginBottom: "0.6rem" }}>
                    Find it at
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {productLinks(result.identification).map(({ label, url, icon }) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "0.4rem 0.85rem",
                          borderRadius: 20,
                          border: "1px solid var(--glass-stroke)",
                          background: "rgba(255,255,255,0.6)",
                          fontFamily: "var(--font-sans)", fontSize: "0.82rem",
                          color: "var(--ink-2)", textDecoration: "none",
                          transition: "background 0.15s, color 0.15s",
                        }}
                        onMouseEnter={e => {
                          const el = e.currentTarget as HTMLAnchorElement;
                          el.style.background = "var(--glass-light)";
                          el.style.color = "var(--ink-1)";
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget as HTMLAnchorElement;
                          el.style.background = "rgba(255,255,255,0.6)";
                          el.style.color = "var(--ink-2)";
                        }}
                      >
                        <span>{icon}</span>
                        <span>{label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── Chat card ────────────────────────────────────────────── */}
            <ProductChat
              sessionId={sessionId}
              onSessionId={setSessionId}
              onCaptureCommand={() => captureRef.current?.()}
              placeholder={result ? `Ask about ${result.identification}…` : "Scan a product to start asking questions"}
            />

          </div>
        </main>
      </div>
    </>
  );
}
