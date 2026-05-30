import { Logo } from "./Primitives";

const NAV_LINKS = [
  { label: "Chat", hash: "#/chat" },
  { label: "Vision Feed", hash: "#/vision" },
  { label: "Product Discovery", hash: "#/product-discovery" },
  { label: "Relay", hash: "#/relay" },
];

export function SiteNav({ light = false }: { light?: boolean }) {
  const navigate = (hash: string) => {
    window.location.hash = hash;
    window.scrollTo(0, 0);
  };

  const textColor = light ? "rgba(255,255,255,0.8)" : "var(--ink-2)";
  const hoverColor = light ? "#ffffff" : "var(--ink-1)";

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
      }}
    >
      <button
        onClick={() => navigate("#/")}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        <Logo light={light} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "clamp(1rem, 3vw, 2.5rem)" }}>
        {NAV_LINKS.map(({ label, hash }) => (
          <button
            key={hash}
            onClick={() => navigate(hash)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              fontSize: "0.875rem",
              letterSpacing: "0.01em",
              color: textColor,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = hoverColor; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = textColor; }}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
