import { Logo } from "./Primitives";

const NAV_LINKS = [
  { label: "Product Discovery", hash: "#/product-discovery" },
  { label: "Relay", hash: "#/relay" },
];

export function SiteNav() {
  return (
    <nav
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 clamp(1.5rem, 5vw, 4rem)",
        height: 56,
        background: "rgba(240,246,240,0.72)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderBottom: "1px solid var(--glass-stroke)",
      }}
    >
      <a href="#/" style={{ textDecoration: "none" }}>
        <Logo />
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: "clamp(1rem, 3vw, 2.5rem)" }}>
        {NAV_LINKS.map(({ label, hash }) => (
          <a
            key={hash}
            href={hash}
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              fontSize: "0.875rem",
              letterSpacing: "0.01em",
              color: "var(--ink-2)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-2)"; }}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
