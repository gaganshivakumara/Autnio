// Halo — navigation, capability sections, statement, footer.

function NavBar() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const el = document.querySelector("#scroll-root") || window;
    const onScroll = () => setScrolled((el.scrollTop || window.scrollY) > 40);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  const links = ["Vision", "Automation", "Awareness", "Company"];
  return (
    <nav style={{
      position: "absolute", zIndex: 20, top: 0, left: 0, right: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "1.5rem clamp(1.5rem, 5vw, 4rem)",
    }}>
      <Logo light />
      <div style={{ display: "flex", alignItems: "center", gap: "2.2rem" }}>
        <div style={{ display: "flex", gap: "2rem" }} className="nav-links">
          {links.map((l) => (
            <a key={l} href="#" style={{
              fontFamily: "var(--font-sans)", fontWeight: 400, fontSize: "0.92rem",
              color: "var(--white-85)", textDecoration: "none", letterSpacing: "0.01em",
              transition: "opacity var(--dur-hover) var(--ease-soft)",
            }}
            onMouseEnter={(e) => (e.target.style.opacity = "0.6")}
            onMouseLeave={(e) => (e.target.style.opacity = "1")}>{l}</a>
          ))}
        </div>
        <Button variant="ghost" light style={{ padding: "0.6rem 1.2rem", fontSize: "0.88rem" }}>Sign in</Button>
      </div>
    </nav>
  );
}

function Icon({ name, size = 22, color = "var(--green-moss)" }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons({ nameAttr: "data-lucide", icons: window.lucide.icons }); }, []);
  return <i ref={ref} data-lucide={name} style={{ width: size, height: size, color, strokeWidth: 1.4 }}></i>;
}

const CAPABILITIES = [
  { icon: "eye", title: "Real-world vision", body: "Continuous scene understanding, object grounding, and sign reading — narrated softly, in real time." },
  { icon: "cpu", title: "Computer automation", body: "Describe the outcome. halo plans the steps and runs them on your machine — forms, apps, workflows." },
  { icon: "audio-lines", title: "Voice presence", body: "Speak naturally from any device. halo listens, reasons, and replies in a calm, neural voice." },
  { icon: "folders", title: "Files & memory", body: "Your documents, routines, and preferences travel with you, quietly organized and always in context." },
];

function Capabilities() {
  return (
    <section style={{ padding: "clamp(5rem, 12vh, 9rem) clamp(1.5rem, 6vw, 6rem)", maxWidth: 1280, margin: "0 auto" }}>
      <div className="label" style={{ marginBottom: "1.4rem" }}>Capabilities</div>
      <h2 className="h1" style={{ maxWidth: "18ch", marginBottom: "3.5rem" }}>
        One presence, attentive to both of your worlds.
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
        {CAPABILITIES.map((c, i) => (
          <GlassCard key={c.title} style={{ display: "flex", flexDirection: "column", gap: "0.9rem", minHeight: 220 }}>
            <div className="label" style={{ marginBottom: "auto" }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="h3">{c.title}</h3>
            <p className="body" style={{ fontSize: "0.98rem" }}>{c.body}</p>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section style={{
      position: "relative", padding: "clamp(6rem, 16vh, 11rem) clamp(1.5rem, 6vw, 6rem)",
      textAlign: "center", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "radial-gradient(60% 80% at 50% 50%, var(--sage-glow), transparent 70%)",
      }}></div>
      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto" }}>
        <div className="label" style={{ marginBottom: "2rem" }}>The feeling</div>
        <p className="h2" style={{ fontWeight: 200, lineHeight: 1.25 }}>
          This is not software you open. It is an intelligent atmosphere that
          stays with you — <span style={{ color: "var(--green-moss)" }}>calm, aware,
          and quietly capable.</span>
        </p>
      </div>
    </section>
  );
}

function Footer() {
  const cols = {
    Product: ["Vision", "Automation", "Voice", "Memory"],
    Company: ["About", "Careers", "Press", "Contact"],
    Resources: ["Docs", "Access", "Status", "Privacy"],
  };
  return (
    <footer style={{ background: "var(--sky-low)", padding: "clamp(3.5rem,8vh,6rem) clamp(1.5rem,6vw,6rem) 3rem" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid",
        gridTemplateColumns: "1.4fr repeat(3, 0.8fr)", gap: "2rem" }} className="footer-grid">
        <div>
          <Logo />
          <p className="caption" style={{ maxWidth: "30ch", marginTop: "1.2rem" }}>
            Your AI companion for the digital and physical world.
          </p>
        </div>
        {Object.entries(cols).map(([head, items]) => (
          <div key={head}>
            <div className="label" style={{ fontSize: "0.66rem", marginBottom: "1.1rem" }}>{head}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              {items.map((it) => (
                <a key={it} href="#" className="body" style={{
                  fontSize: "0.92rem", textDecoration: "none", color: "var(--ink-2)",
                  transition: "color var(--dur-hover) var(--ease-soft)",
                }}
                onMouseEnter={(e) => (e.target.style.color = "var(--green-moss)")}
                onMouseLeave={(e) => (e.target.style.color = "var(--ink-2)")}>{it}</a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1280, margin: "3rem auto 0", paddingTop: "1.6rem",
        borderTop: "1px solid var(--glass-stroke)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <span className="mono" style={{ color: "var(--ink-3)" }}>© 2026 halo</span>
        <span className="mono" style={{ color: "var(--ink-3)" }}>An intelligent atmosphere</span>
      </div>
    </footer>
  );
}

Object.assign(window, { NavBar, Capabilities, Statement, Footer, Icon });
