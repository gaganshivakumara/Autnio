# Landing UI kit — Halo

The cinematic marketing landing page. The hero rings video is the emotional centerpiece; everything else is airy negative space, floating glass, and ultra-thin type.

## Run it
Open `index.html`. Loads React + Babel (pinned), Geist from Google Fonts, Moue locally, and the rings video from `../../assets/`.

## Files
- **`atmosphere.css`** — the living-sky scene (drifting clouds, swaying grass, orbiting fallback rings), the green ground-fade scrim that integrates the video into the page, and the glass / pill surfaces.
- **`Primitives.jsx`** — `RingMark`, `Logo`, `Button` (primary / ghost / text — never gradient), `Pill` (floating glass overlay), `GlassCard`.
- **`Hero.jsx`** — `Hero` with the real rings video over a CSS fallback scene, floating headline + label + subtext, and corner-pinned suspended pills (hidden below 980px so they never cross the title).
- **`Sections.jsx`** — `NavBar`, `Capabilities` (text-only glass cards), `Statement`, `Footer`.

## Notes
- The hero `<video>` autoplays muted/looped; an explicit `play()` kick handles autoplay-blocked browsers, with `hero-poster.png` as the poster.
- The video is gently desaturated (`saturate .86`) so it reads airy rather than vivid; the bottom green fade replaces the reference's blue glow.
- All ambient motion respects `prefers-reduced-motion`.
- Lucide is loaded for optional UI icons but the landing is intentionally icon-free (text-forward).
