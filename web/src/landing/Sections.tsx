// Halo — capability cards, atmospheric statement, and footer.
import { Logo } from "./Primitives";
import { Stories } from "@/components/ui/stories-carousel";

const CAPABILITY_STORIES = [
  {
    id: "vision",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=720&q=80&auto=format&fit=crop",
    label: "01 — Vision",
    title: "Real-world vision",
    body: "Continuous scene understanding, object grounding, and sign reading — narrated softly, in real time.",
    avatarFallback: "V",
  },
  {
    id: "automation",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=720&q=80&auto=format&fit=crop",
    label: "02 — Automation",
    title: "Computer automation",
    body: "Describe the outcome. halo plans the steps and runs them on your machine — forms, apps, workflows.",
    avatarFallback: "A",
  },
  {
    id: "voice",
    image: "https://images.unsplash.com/photo-1590736969955-71cc94901144?w=720&q=80&auto=format&fit=crop",
    label: "03 — Voice",
    title: "Voice presence",
    body: "Speak naturally from any device. halo listens, reasons, and replies in a calm, neural voice.",
    avatarFallback: "P",
  },
  {
    id: "memory",
    image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=720&q=80&auto=format&fit=crop",
    label: "04 — Memory",
    title: "Files & memory",
    body: "Your documents, routines, and preferences travel with you, quietly organized and always in context.",
    avatarFallback: "M",
  },
];

export function Capabilities() {
  return (
    <section
      style={{
        padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)",
        maxWidth: 1280,
        margin: "0 auto",
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
        Capabilities
      </div>
      <h2
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 300,
          fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
          lineHeight: 1.04,
          letterSpacing: "-0.015em",
          color: "var(--ink-1)",
          maxWidth: "18ch",
          marginBottom: "3.5rem",
          marginTop: 0,
        }}
      >
        One presence, attentive to both of your worlds.
      </h2>
      <Stories stories={CAPABILITY_STORIES} />
    </section>
  );
}

export function Statement() {
  return (
    <section
      style={{
        position: "relative",
        padding: "clamp(6rem, 16vh, 11rem) clamp(1.5rem, 6vw, 6rem)",
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background: "radial-gradient(60% 80% at 50% 50%, var(--sage-glow), transparent 70%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 400,
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.32em",
            color: "var(--ink-3)",
            marginBottom: "2rem",
          }}
        >
          The feeling
        </div>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 200,
            fontSize: "clamp(1.8rem, 3vw, 2.8rem)",
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            color: "var(--ink-1)",
            margin: 0,
          }}
        >
          This is not software you open. It is an intelligent atmosphere that
          stays with you —{" "}
          <span style={{ color: "var(--green-moss)" }}>
            calm, aware, and quietly capable.
          </span>
        </p>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer style={{ background: "var(--sky-low)", padding: "clamp(3.5rem,8vh,6rem) clamp(1.5rem,6vw,6rem) 3rem" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Logo />
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 400,
            fontSize: "0.875rem",
            lineHeight: 1.5,
            color: "var(--ink-3)",
            maxWidth: "30ch",
            marginTop: "1.2rem",
          }}
        >
          Your AI companion for the digital and physical world.
        </p>
      </div>
      <div
        style={{
          maxWidth: 1280,
          margin: "3rem auto 0",
          paddingTop: "1.6rem",
          borderTop: "1px solid var(--glass-stroke)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 400,
            fontSize: "0.8125rem",
            letterSpacing: "0.02em",
            color: "var(--ink-3)",
          }}
        >
          © 2026 halo
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 400,
            fontSize: "0.8125rem",
            letterSpacing: "0.02em",
            color: "var(--ink-3)",
          }}
        >
          An intelligent atmosphere
        </span>
      </div>
    </footer>
  );
}
