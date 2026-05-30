# Halo — Design System

> **"An intelligent atmosphere."**
> Halo is the brand and marketing identity for an AI companion that moves between the digital and physical world — it sees what you see, automates what you need, and stays with you as a calm, ambient presence.

This design system captures a **cinematic, airy, nature-blended-with-technology** aesthetic. The emotional target is *futuristic serenity*: the user should feel they are not opening software, but stepping into an intelligent atmosphere. The signature is the **halo rings** — interlinked glassy rings floating above a windswept grass field under a bright sky — paired with **soft atmospheric green** light (never neon) and **ultra-thin** floating typography.

---

## Sources

This system was built from materials the user provided. The reader may not have access, but they are recorded here so the work can be deepened:

- **Product context & copy** — GitHub repo **[gaganshivakumara/Autnio](https://github.com/gaganshivakumara/Autnio)**. The underlying product is an AI companion platform (AWS Bedrock agents, computer automation via Open Interpreter, dual-model vision for accessibility, voice I/O, Box files, DynamoDB memory). Explore the repo for capability copy, example workflows, and the product vision that informs Halo's marketing language. *Note: the repo names the product "Autnio"; the user renamed the brand to **Halo** — keep the ring logo, use the Halo name.*
- **Hero video** — `assets/hero-rings.mp4` (user-supplied). Glassy gold-rimmed interlinked rings floating above realistic grass and a cloud-filled blue sky. This is the literal centerpiece of the hero. `assets/hero-poster.png` is a still extracted from it.
- **Brand display font** — `fonts/moue.otf` (Moue, user-supplied). See *Font licensing* below.

---

## Content fundamentals

**Voice:** calm, reassuring, quietly confident. Halo speaks the way the product behaves — present but never loud. The atmosphere does the work; the words stay out of the way.

- **Person:** addresses the reader as **you**; the product is **Halo** (third person), never "we/our." E.g. *"Halo sees what you see… a calm presence across every screen and street."*
- **Casing:** Sentence case for headlines and body. The **wordmark is always lowercase** (`halo`) in Moue. Section labels and telemetry are **UPPERCASE**, heavily tracked.
- **Headlines** are short, evocative, almost meditative — fragments over full sentences: *"An intelligent atmosphere."* / *"One presence, attentive to both of your worlds."*
- **Body** is plain and warm, favouring verbs of perception and care: *sees, listens, reasons, narrated softly, travels with you, quietly organized.*
- **Capability names** are two-word noun phrases: *Real-world vision · Computer automation · Voice presence · Files & memory.*
- **Overlay pills** are 1–2 word status fragments, present-tense or stative: *Awareness active · Environmental guidance · Navigation ready · Ambient intelligence.*
- **No emoji. No exclamation. No hype words** ("revolutionary", "10x"). Numbers appear only as quiet telemetry (`AWARENESS 0.98 · LATENCY 142ms`), never as marketing stats.
- **Tone words to keep close:** calm, aware, ambient, atmosphere, presence, weightless, serene, organic.

---

## Visual foundations

**Overall vibe.** Bright and open — *never dark*. Backgrounds are sky and haze; the page feels illuminated by natural daylight. Every surface is soft: nothing has a hard edge, a harsh shadow, or a saturated fill.

- **Color.** A nature palette. **Atmospheric greens** (`#8FBF8F`, `#7AA874`, `#BFD8B8`, deep moss `#4F6B4C`) carry the brand; **sky/haze neutrals** (`#D7E7F0 → #FBFDFB`) form backgrounds; **green-tinted inks** (`#1B241D → #AAB4AC`) handle text on light. The defining move: the soft **sage ground glow** (`rgba(143,191,143,0.18–0.42)`) that diffuses up from the bottom of the hero — this *replaces the reference's blue cube fade* with organic green light. Think sunlight through grass, emerald fog. Never neon.
- **Typography.** Two faces. **Moue** (geometric, rounded, single weight) is the wordmark/signature only. **Geist** (variable 100–900) does everything else — headlines run **ultra-thin (200–300)** at large cinematic sizes with negative tracking; body is 400. **Geist Mono** handles labels and telemetry. Labels are uppercase with `0.32em` tracking and low opacity, floating like UI annotations.
- **Backgrounds.** Full-bleed atmosphere. The hero is the **rings video** (`object-fit: cover`), gently desaturated (`saturate .86`) and topped with two scrims: a faint white haze at the top and the **green fade** at the bottom that melts the video into the page. Content sections sit on flat `--haze`; one statement section uses a soft radial sage glow. No patterns, no hard dividers — sections separate through space and a single hairline.
- **Glassmorphism.** Floating surfaces are translucent and blurred. Two recipes: `glass-hero` (12% white, 16px blur) for pills over the video; `glass` (58% white, 22px blur) for capability cards on light. Borders are near-white hairlines (`rgba(255,255,255,.32–.70)`); fills are never opaque.
- **Spacing & layout.** Generous, airy. Massive negative space around the centered focal object. Sections are `max-width: 1280`, centered, with `clamp()`-driven vertical rhythm (5–11rem). Pills are absolutely positioned and *suspended* — they bob slowly in place.
- **Radii.** Soft and large: pill `999px`, lg `28px`, md `18px`, sm `12px`. Icon tiles and cards favour the larger end.
- **Shadows / elevation.** Atmospheric, never harsh — large blur, negative spread, green-tinted: `float 0 24px 60px -24px rgba(79,107,76,.35)`, `card`, `pill`. Plus a diffuse green glow for emphasis. No crisp drop shadows.
- **Motion.** Everything drifts; **nothing snaps.** Clouds drift 64–110s, the ground glow breathes 14s, pills bob 6–9s, grass sways, the fallback rings orbit slowly. Easing is `--ease-cinematic cubic-bezier(.22,.61,.36,1)` / `--ease-soft`. Hover = a 2px lift over 0.5s + soft shadow; press = scale to 0.985. No bounces, no aggressive transitions. All ambient motion respects `prefers-reduced-motion`.
- **Hover / press states.** Links fade to ~60% opacity or shift to moss green. Buttons lift gently and deepen their shadow; they never change hue abruptly. **Buttons are solid or glass — never gradient-filled.**
- **Imagery vibe.** Cool-warm natural daylight — blue sky, green grass, gold-glass rings. Bright, soft-focus, dreamlike. Slightly desaturated in-product so it reads calm rather than vivid.

---

## Iconography

See **ICONOGRAPHY.md** for the full approach. In short: the brand has no proprietary icon set, so Halo uses **[Lucide](https://lucide.dev)** (thin 1.4 stroke line icons, loaded from CDN) — chosen to match the airy, ultra-thin type. **This is a documented substitution.** The one true brand glyph is the **interlinked ring mark** (an SVG that mirrors the hero rings), used as the logo. No emoji; no unicode glyphs as icons.

---

## Index — what's in this system

| File | What it is |
|---|---|
| `README.md` | This file — context, content & visual foundations, index |
| `ICONOGRAPHY.md` | Icon approach, Lucide usage, the ring mark |
| `SKILL.md` | Agent-Skill manifest for reuse in Claude Code |
| `colors_and_type.css` | All design tokens — colors, type families, semantic type scale, radii, shadows, motion |
| `fonts/moue.otf` | Brand display font (Moue) |
| `assets/hero-rings.mp4` | The hero centerpiece video |
| `assets/hero-poster.png` | Poster still from the video |
| `preview/*.html` | Design-system specimen cards (colors, type, spacing, components, brand) |
| `ui_kits/landing/` | **Landing page UI kit** — full cinematic marketing page (see its README) |

### UI kits
- **`ui_kits/landing/`** — the cinematic marketing landing page: rings-video hero with floating type and suspended glass pills, capability cards, an atmospheric statement, and a footer. Components: `Primitives.jsx` (ring mark, logo, buttons, pills, glass card), `Hero.jsx`, `Sections.jsx`.

---

## Font licensing ⚠️

- **Moue** is bundled as *"Demo for Personal Use"* (from iFonts). **Replace with a licensed copy before any production/commercial use.**
- **Geist** (the primary UI/headline face) is an open substitution for the brief's suggested Neue Montreal / SF Pro Display / Satoshi, which are not openly licensed. If you own those, swap `--font-sans` in `colors_and_type.css` and provide the font files.
