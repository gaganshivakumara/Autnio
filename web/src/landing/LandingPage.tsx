// Halo — cinematic marketing landing page.
import { useState } from "react";
import { Hero } from "./Hero";
import { Capabilities, Statement, Footer } from "./Sections";
import { ChatInterface } from "../chat/ChatInterface";

export function LandingPage({ onSignIn: _onSignIn }: { onSignIn: () => void }) {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const scrollToChat = () => {
    document.getElementById("chat")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Hero onScrollDown={scrollToChat} />
      <Capabilities />

      <section
        id="chat"
        style={{
          padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)",
          maxWidth: 1280,
          margin: "0 auto",
          textAlign: "center",
          scrollMarginTop: 0,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.32em", color: "var(--ink-3)", marginBottom: "1.4rem" }}>
          Chat
        </div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 300, fontSize: "clamp(2.5rem, 5vw, 4.5rem)", lineHeight: 1.04, letterSpacing: "-0.015em", color: "var(--ink-1)", marginBottom: "3.5rem", marginTop: 0 }}>
          Everything in one place.
        </h2>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ChatInterface sessionId={sessionId} onSessionId={setSessionId} />
        </div>
      </section>

      <Statement />
      <Footer />
    </>
  );
}
