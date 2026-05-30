// Halo — cinematic hero. Real rings video centerpiece + floating type + suspended pills.
import { useEffect, useMemo, useRef } from "react";
import { Button, Logo } from "./Primitives";

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

const NAV_LINKS = [
  { label: "Product Discovery", hash: "#/product-discovery" },
];

function NavBar() {
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
      <div style={{ display: "flex", alignItems: "center", gap: "clamp(1rem, 3vw, 2rem)" }}>
        {NAV_LINKS.map(({ label, hash }) => (
          <a
            key={hash}
            href={hash}
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              fontSize: "0.875rem",
              color: "var(--white-65)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--white-65)"; }}
          >
            {label}
          </a>
        ))}
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

export function Hero({ onScrollDown }: { onScrollDown: () => void }) {
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

      <NavBar />

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
        <div style={{ display: "flex", justifyContent: "center", marginTop: "2.4rem" }}>
          <Button variant="ghost" light onClick={onScrollDown}>Start here</Button>
        </div>
      </div>

      {/* Feature bullet list — left aligned */}
      <ul
        style={{
          position: "absolute",
          zIndex: 5,
          bottom: "14%",
          left: "clamp(1.5rem, 5vw, 4rem)",
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.55rem",
        }}
      >
        {["Awareness active", "Environmental guidance", "Navigation ready", "Ambient intelligence"].map((item) => (
          <li
            key={item}
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 400,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "var(--white-65)",
            }}
          >
            — {item}
          </li>
        ))}
      </ul>

      <ScrollCue />
    </header>
  );
}
