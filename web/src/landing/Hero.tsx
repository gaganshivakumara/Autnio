// Halo — cinematic hero. Real rings video centerpiece + floating type + suspended pills.
import { useEffect, useMemo, useRef } from "react";
import { Button, Logo, Pill } from "./Primitives";

function HeroScene() {
  return (
    <div className="atmos" aria-hidden="true">
      <div className="cloud c1" />
      <div className="cloud c2" />
      <div className="cloud c3" />
      <div className="rings-fallback">
        <div className="ring r1" />
        <div className="ring r2" />
        <div className="ring r3" />
      </div>
      <div className="atmos-haze" />
      <Grass />
      <div className="green-glow" />
    </div>
  );
}

function Grass() {
  const blades = useMemo(
    () =>
      Array.from({ length: 70 }, () => ({
        dur: (3.6 + Math.random() * 3).toFixed(2),
        delay: (-Math.random() * 4).toFixed(2),
        h: 30 + Math.random() * 60,
      })),
    [],
  );
  return (
    <div className="grass">
      {blades.map((b, i) => (
        <span
          key={i}
          className="blade"
          style={
            {
              "--blade-dur": `${b.dur}s`,
              "--blade-delay": `${b.delay}s`,
              height: `${b.h}%`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function NavBar({ onSignIn }: { onSignIn: () => void }) {
  const links = ["Vision", "Automation", "Awareness", "Company"];
  return (
    <nav
      style={{
        position: "absolute",
        zIndex: 20,
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.5rem clamp(1.5rem, 5vw, 4rem)",
      }}
    >
      <Logo light />
      <div style={{ display: "flex", alignItems: "center", gap: "2.2rem" }}>
        <div style={{ display: "flex", gap: "2rem" }} className="nav-links">
          {links.map((l) => (
            <a
              key={l}
              href="#"
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 400,
                fontSize: "0.92rem",
                color: "var(--white-85)",
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "opacity var(--dur-hover) var(--ease-soft)",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "0.6"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
            >
              {l}
            </a>
          ))}
        </div>
        <Button variant="ghost" light onClick={onSignIn} style={{ padding: "0.6rem 1.2rem", fontSize: "0.88rem" }}>
          Sign in
        </Button>
      </div>
    </nav>
  );
}

function ScrollCue() {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 5,
        bottom: "2.2rem",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.6rem",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 400,
          fontSize: "0.62rem",
          textTransform: "uppercase",
          letterSpacing: "0.28em",
          color: "var(--white-65)",
        }}
      >
        Scroll
      </span>
      <span
        style={{
          width: 1,
          height: 38,
          background: "linear-gradient(180deg, var(--white-65), transparent)",
        }}
      />
    </div>
  );
}

export function Hero({ onSignIn }: { onSignIn: () => void }) {
  const vref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    const kick = () => { v.play().catch(() => {}); };
    kick();
    const onTouch = () => {
      kick();
      window.removeEventListener("pointerdown", onTouch);
    };
    window.addEventListener("pointerdown", onTouch);
    return () => { window.removeEventListener("pointerdown", onTouch); };
  }, []);

  return (
    <header style={{ position: "relative", height: "100vh", minHeight: 680, overflow: "hidden" }}>
      <HeroScene />
      <video
        ref={vref}
        className="hero-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/assets/hero-poster.png"
      >
        <source src="/assets/hero-rings.mp4" type="video/mp4" />
      </video>
      <div className="hero-scrim" />
      <div className="hero-fade" />

      <NavBar onSignIn={onSignIn} />

      {/* Floating typography */}
      <div
        style={{
          position: "absolute",
          zIndex: 5,
          left: 0,
          right: 0,
          top: "21%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "0 6vw",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 400,
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.32em",
            color: "var(--white-65)",
            marginBottom: "1.6rem",
          }}
        >
          Ambient intelligence · digital &amp; physical
        </div>
        <h1
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 200,
            fontSize: "clamp(3.5rem, 9vw, 9rem)",
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
            color: "var(--white)",
            maxWidth: "16ch",
            textShadow: "0 2px 40px rgba(40,60,40,0.25)",
            margin: 0,
          }}
        >
          halo
        </h1>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 300,
            fontSize: "clamp(1.05rem,1.7vw,1.4rem)",
            color: "var(--white-85)",
            maxWidth: "44ch",
            marginTop: "1.8rem",
            lineHeight: 1.6,
            textShadow: "0 1px 20px rgba(40,60,40,0.3)",
          }}
        >
          halo sees what you see, automates what you need, and moves with you —
          a calm presence across every screen and street.
        </p>
        <div style={{ display: "flex", gap: "0.9rem", marginTop: "2.4rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Button variant="primary">Request access</Button>
          <Button variant="ghost" light>Watch the film</Button>
        </div>
      </div>

      {/* Suspended overlay pills */}
      <Pill className="hero-pill" bob={7} delay={-1} style={{ position: "absolute", zIndex: 5, top: "24%", left: "4%" }}>
        Awareness active
      </Pill>
      <Pill className="hero-pill" bob={8.5} delay={-3} style={{ position: "absolute", zIndex: 5, top: "32%", right: "4%" }}>
        Environmental guidance
      </Pill>
      <Pill className="hero-pill" bob={6.5} delay={-2} style={{ position: "absolute", zIndex: 5, bottom: "15%", left: "5%" }}>
        Navigation ready
      </Pill>
      <Pill className="hero-pill" bob={9} delay={-4} style={{ position: "absolute", zIndex: 5, bottom: "21%", right: "5%" }}>
        Ambient intelligence
      </Pill>

      <ScrollCue />
    </header>
  );
}
