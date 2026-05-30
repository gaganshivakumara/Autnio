// Halo — capability cards, atmospheric statement, and footer.
import { GlassCard, Logo } from "./Primitives";

const CAPABILITIES = [
  {
    title: "Real-world vision",
    body: "Continuous scene understanding, object grounding, and sign reading — narrated softly, in real time.",
  },
  {
    title: "Computer automation",
    body: "Describe the outcome. halo plans the steps and runs them on your machine — forms, apps, workflows.",
  },
  {
    title: "Voice presence",
    body: "Speak naturally from any device. halo listens, reasons, and replies in a calm, neural voice.",
  },
  {
    title: "Files & memory",
    body: "Your documents, routines, and preferences travel with you, quietly organized and always in context.",
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {CAPABILITIES.map((c, i) => (
          <GlassCard key={c.title} style={{ display: "flex", flexDirection: "column", gap: "0.9rem", minHeight: 220 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 400,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.32em",
                color: "var(--ink-3)",
                marginBottom: "auto",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 400,
                fontSize: "1.5rem",
                lineHeight: 1.2,
                letterSpacing: "-0.005em",
                color: "var(--ink-1)",
                margin: 0,
              }}
            >
              {c.title}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 400,
                fontSize: "0.98rem",
                lineHeight: 1.65,
                color: "var(--ink-2)",
                margin: 0,
              }}
            >
              {c.body}
            </p>
          </GlassCard>
        ))}
      </div>
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
