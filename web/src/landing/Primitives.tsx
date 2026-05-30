// Halo — brand primitives: ring logo mark, wordmark, buttons, pills, glass cards.
import { useState, type CSSProperties, type ReactNode } from "react";

// Interlinked halo rings — the brand mark (mirrors the hero video).
export function RingMark({ size = 26, stroke = "currentColor" }: { size?: number; stroke?: string }) {
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

export function Logo({ light = false }: { light?: boolean }) {
  const color = light ? "#FFFFFF" : "var(--ink-1)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <RingMark size={26} stroke={color} />
      <span style={{
        fontFamily: "var(--font-display)",
        fontWeight: 400,
        letterSpacing: "0.01em",
        fontSize: "1.5rem",
        color,
        lineHeight: 1,
      }}>
        halo
      </span>
    </div>
  );
}

// Buttons — solid or glass, NEVER gradient. Soft hover lift, gentle press.
type ButtonVariant = "primary" | "ghost" | "text";

export function Button({
  children,
  variant = "primary",
  light = false,
  onClick,
  style,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  light?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);

  const base: CSSProperties = {
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

  const variants: Record<ButtonVariant, CSSProperties> = {
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
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

// Floating glass info pill — suspended in air over the hero.
export function Pill({
  children,
  bob = 7,
  delay = 0,
  style,
  className = "",
}: {
  children: ReactNode;
  bob?: number;
  delay?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`pill ${className}`}
      style={{ "--bob": `${bob}s`, animationDelay: `${delay}s`, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function GlassCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="glass" style={{ padding: "1.75rem", ...style }}>{children}</div>;
}
