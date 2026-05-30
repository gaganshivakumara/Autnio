import { useState } from "react";
import { SiteNav } from "../landing/SiteNav";
import { ChatInterface } from "../chat/ChatInterface";
import { FileBrowser } from "../files/FileBrowser";

export function ChatPage() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  return (
    <div style={{ minHeight: "100vh", background: "var(--sky-low)" }}>
      <div style={{ position: "relative", height: 56 }}>
        <SiteNav />
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(3rem, 8vh, 6rem) clamp(1.5rem, 6vw, 6rem)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Chat
        </div>
        <h1 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          Everything in one place.
        </h1>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2rem" }}>
          <ChatInterface sessionId={sessionId} onSessionId={setSessionId} />
          <div style={{ width: "100%" }}>
            <FileBrowser />
          </div>
        </div>
      </main>
    </div>
  );
}
