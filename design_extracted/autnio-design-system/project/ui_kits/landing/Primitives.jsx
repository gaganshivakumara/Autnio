// Halo — brand primitives: ring logo mark, wordmark, buttons, pills, glass cards.

// Interlinked halo rings — the brand mark (mirrors the hero video).
function RingMark({ size = 26, stroke = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true"
         style={{ display: "block" }}>
      <ellipse cx="20" cy="20" rx="9.5" ry="16" transform="rotate(-32 20 20)"
               stroke={stroke} strokeWidth="2.1" />
      <ellipse cx="20" cy="20" rx="9.5" ry="16" transform="rotate(32 20 20)"
               stroke={stroke} strokeWidth="2.1" />
    </svg>
  );
}

function Logo({ light = false }) {
  const color = light ? "#FFFFFF" : "var(--ink-1)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <RingMark size={26} stroke={color} />
      <span className="wordmark" style={{ fontSize: "1.5rem", color, lineHeight: 1 }}>
        halo
      </span>
    </div>
  );
}

// Buttons — solid or glass, NEVER gradient. Soft hover lift, gentle press.
function Button({ children, variant = "primary", light = false, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);

  const base = {
    fontFamily: "var(--font-sans)",
    fontWeight: 400,
    fontSize: "0.95rem",
    letterSpacing: "0.01em",
    padding: "0.85rem 1.6rem",
    borderRadius: "var(--r-pill)",
    cursor: "pointer",
    border: "1px solid transparent",
    transition: "all var(--dur-hover) var(--ease-soft)",
    transform: press ? "scale(0.985)" : hover ? "translateY(-2px)" : "none",
    whiteSpace: "nowrap",
  };

  const variants = {
    primary: {
      background: "var(--green-moss)",
      color: "#fff",
      boxShadow: hover ? "0 12px 30px -12px rgba(79,107,76,0.6)" : "var(--shadow-pill)",
    },
    ghost: {
      background: light ? "var(--glass-hero)" : "var(--glass-light)",
      color: light ? "#fff" : "var(--ink-1)",
      borderColor: light ? "var(--glass-hero-border)" : "var(--glass-stroke)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    },
    text: {
      background: "transparent",
      color: light ? "var(--white-85)" : "var(--ink-2)",
      padding: "0.85rem 0.4rem",
      opacity: hover ? 1 : 0.85,
    },
  };

  return (
    <button type="button" onClick={onClick}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
            onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
            style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

// Floating glass info pill — suspended in air over the hero.
function Pill({ children, bob = 7, delay = 0, style, className = "" }) {
  return (
    <div className={`pill ${className}`} style={{ "--bob": `${bob}s`, animationDelay: `${delay}s`, ...style }}>
      {children}
    </div>
  );
}

function GlassCard({ children, style }) {
  return <div className="glass" style={{ padding: "1.75rem", ...style }}>{children}</div>;
}

Object.assign(window, { RingMark, Logo, Button, Pill, GlassCard });
