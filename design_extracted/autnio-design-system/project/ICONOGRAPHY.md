# Iconography — Halo

Halo's icon language is deliberately minimal, matching the ultra-thin, airy typography. Icons are line-drawn, never filled, never decorative.

## The ring mark (the one true brand glyph)

The only proprietary mark is the **interlinked halo rings** — two crossed ellipses that echo the rings floating in the hero video. It is a hand-authored SVG (see `RingMark` in `ui_kits/landing/Primitives.jsx`):

```html
<svg width="26" height="26" viewBox="0 0 40 40" fill="none">
  <ellipse cx="20" cy="20" rx="9.5" ry="16" transform="rotate(-32 20 20)" stroke="currentColor" stroke-width="2.1"/>
  <ellipse cx="20" cy="20" rx="9.5" ry="16" transform="rotate(32 20 20)" stroke="currentColor" stroke-width="2.1"/>
</svg>
```

- Stroke `2.1` at the 40-unit viewbox — a thin, even monoline that pairs with the wordmark.
- Uses `currentColor` so it inverts cleanly: `--ink-1` on light, white over the hero, white inside a moss badge.
- Always paired with the lowercase **`halo`** wordmark in Moue, or used alone as a favicon/app mark.

## UI icons — Lucide (substituted)

The product repo ships **no icon set**, so Halo adopts **[Lucide](https://lucide.dev)** for interface icons. Rationale: Lucide's open, consistent **line icons at a thin stroke** match the brand's airy, ultra-thin aesthetic better than any filled set.

> ⚠️ **Substitution flag:** Lucide is a chosen stand-in, not a brand-owned set. If a licensed/house icon set exists, replace it and update this file.

**Usage**
```html
<script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
<i data-lucide="eye"></i>
<script>lucide.createIcons();</script>
```
- **Stroke weight:** `1.4` (thinner than Lucide's `2` default) to sit calmly beside thin type. Set via `stroke-width` on the rendered SVG / the `Icon` component.
- **Color:** `--green-moss` for active/feature icons; `--ink-3` for quiet UI.
- **Containment:** feature icons sit in a `52×52` rounded tile (`--r-md`) filled with `--sage-glow` and a faint green hairline border.
- **Icons in use:** `eye` (vision), `cpu` (automation), `audio-lines` (voice), `folders` (files & memory).

## Rules

- **No emoji**, ever — it breaks the serene, premium tone.
- **No unicode characters as icons** (no ✓, ➜ rendered as glyphs). Use Lucide or text.
- Keep icons sparse. A capability card gets one icon; the hero gets none (the rings *are* the imagery).
- Never fill icons or add multi-color — line only, single color.
