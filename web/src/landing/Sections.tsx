// Halo â€” capability cards, atmospheric statement, and footer.
import { Logo } from "./Primitives";
import { Stories } from "@/components/ui/stories-carousel";
import Grainient from "@/components/ui/Grainient";

const CAPABILITY_STORIES = [
  {
    id: "vision",
    image: "/assets/sceneunderstanding.png",
    label: "01 â€” Vision",
    title: "Real-world vision",
    body: "Continuous scene understanding, object grounding, and sign reading â€” narrated softly, in real time.",
    avatarFallback: "V",
  },
  {
    id: "automation",
    image: "/assets/computerautomation.png",
    label: "02 â€” Automation",
    title: "Computer automation",
    body: "Describe the outcome. halo plans the steps and runs them on your machine â€” forms, apps, workflows.",
    avatarFallback: "A",
  },
  {
    id: "voice",
    image: "https://images.unsplash.com/photo-1590736969955-71cc94901144?w=720&q=80&auto=format&fit=crop",
    label: "03 â€” Voice",
    title: "Voice presence",
    body: "Speak naturally from any device. halo listens, reasons, and replies in a calm, neural voice.",
    avatarFallback: "P",
  },
  {
    id: "product-discovery",
    image: "/assets/apifyproductscanner.png",
    label: "04 â€” Discovery",
    title: "Product discovery",
    body: "Point your camera at any product. halo identifies it, scrapes reviews, and reads back a clear summary.",
    avatarFallback: "D",
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
        padding: "clamp(2rem, 5vh, 4rem) clamp(1.5rem, 6vw, 6rem) clamp(4rem, 10vh, 7rem)",
        maxWidth: 1280,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      {/* Rounded rect container: Grainient fills it, text sits on top */}
      <div
        style={{
          position: "relative",
          borderRadius: 28,
          overflow: "hidden",
          padding: "clamp(3.5rem, 8vw, 6rem) clamp(2rem, 6vw, 5rem)",
        }}
      >
        {/* Grainient background â€” halo sage-green palette */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <Grainient
            color1="#c8dfc0"
            color2="#4f6b4c"
            color3="#1c2e1e"
            timeSpeed={0.18}
            warpStrength={0.8}
            warpFrequency={4.0}
            warpSpeed={1.5}
            warpAmplitude={60.0}
            blendSoftness={0.12}
            rotationAmount={380.0}
            noiseScale={1.8}
            grainAmount={0.055}
            grainScale={1.5}
            contrast={1.3}
            saturation={0.85}
            zoom={0.95}
          />
        </div>

        {/* Text content */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 400,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.32em",
              color: "rgba(255,255,255,0.5)",
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
              color: "#fff",
              margin: 0,
            }}
          >
            This is not software you open. It is an intelligent atmosphere that
            stays with you â€”{" "}
            <span style={{ color: "#a8d4a0", fontWeight: 300 }}>
              calm, aware, and quietly capable.
            </span>
          </p>
        </div>
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
          Â© 2026 halo
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

