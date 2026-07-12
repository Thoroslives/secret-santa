# Design

Visual system for the family Secret Santa. Register is **product** for everything behind sign-in; the public landing is a **brand** surface. Read alongside PRODUCT.md.

## Theme

**Warm hearth.** One theme, dark and warm, like a fire-lit room on Christmas eve. The mood is environmental, so the surface itself carries a slight warmth (a deep ember-charcoal, not pure black), and the brand does the rest: a deep pine-green primary and a single gold accent that reads as candlelight. Cozy and grown-up, quietly festive. No light mode: the hearth is dark by nature, and one committed theme keeps the whole thing consistent.

Colour strategy: **committed**. The deep base plus pine and gold carry the identity; we do not hedge with neutral greys around the edges.

## Color

OKLCH throughout. Warmth lives in the brand colours and the tinted base, never in a second warm layer stacked on top.

```css
:root {
  /* Base — deep warm ember-charcoal (environmental hearth) */
  --bg:             oklch(0.170 0.014 55);   /* page */
  --surface:        oklch(0.215 0.016 55);   /* cards, panels */
  --surface-raised: oklch(0.255 0.018 55);   /* inputs, popovers, raised */
  --border:         oklch(0.320 0.016 55);   /* hairlines */
  --border-strong:  oklch(0.400 0.018 55);

  /* Ink */
  --ink:            oklch(0.940 0.012 85);   /* body — ~13:1 on bg */
  --ink-strong:     oklch(0.975 0.008 85);   /* headings */
  --muted:          oklch(0.720 0.014 78);   /* secondary text — ~5.5:1 */
  --placeholder:    oklch(0.720 0.014 78);   /* never dim below muted */

  /* Brand */
  --primary:        oklch(0.560 0.105 150);  /* pine green — the action colour */
  --primary-hover:  oklch(0.610 0.110 150);
  --primary-press:  oklch(0.500 0.100 150);
  --on-primary:     oklch(0.985 0.010 150);  /* white text on green fills */

  --accent:         oklch(0.800 0.120 82);   /* gold — glow, focus, small marks */
  --accent-text:    oklch(0.850 0.130 84);   /* gold as text on dark — ~7:1 */
  --accent-dim:     oklch(0.680 0.100 82);   /* gold hairline / underglow */

  /* Semantic — subtle, on-brand */
  --success:        oklch(0.700 0.130 150);  /* lighter pine */
  --danger:         oklch(0.620 0.150 32);   /* warm brick, NOT santa-red */
  --on-danger:      oklch(0.985 0.010 32);
  --warning:        oklch(0.780 0.130 68);   /* amber, used rarely */

  --focus:          var(--accent);           /* gold focus ring */
}
```

Rules that bite here: ink-vs-bg stays ≥7:1; the pine primary takes **white** text on fills (Helmholtz-Kohlrausch, mid-luminance saturated); the gold accent is **never a text-bearing fill** (its L sits below the pale-fill threshold), so gold is used as thin rules, focus rings, icon marks, a single hero glow, and gold-coloured text on the dark base, never as a filled button behind label text. Primary vs accent are distinct in both hue (150 vs 82) and lightness (0.56 vs 0.80).

## Typography

Voice words: **warm, crafted, intimate** (a hand-addressed card). Contrast-axis pairing, both chosen off the reflex-reject list.

- **Display / headings:** a warm characterful serif. Primary pick **Hedvig Letters Serif**; fallbacks Piazzolla or Young Serif. Verify it loads before locking. Used for the hero line, page titles, and the match reveal.
- **Body / UI:** **Hanken Grotesk**, a legible humanist grotesque that reads friendly at small sizes on a phone. Fallback Schibsted Grotesk. Carries all interface text, labels, inputs, buttons.
- Never Inter, Georgia, Fraunces, Playfair, Cormorant, DM (reflex-reject / the amateur originals).

Scale: modular ~1.25, base 16px. Headings fluid `clamp()`, display max ≤ 6rem, letter-spacing -0.02em (floor -0.04em), `text-wrap: balance` on h1-h3. Body line-height 1.6 (light-on-dark wants the extra room); long prose `text-wrap: pretty`. Body measure 60-70ch.

## Space, radius, elevation

- **Spacing:** 4px base — 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Vary for rhythm: tight within a group, generous between.
- **Radius:** sm 8 (inputs, buttons) · md 12 (cards) · lg 16 (panels) · full (avatars, small pills). Soft, not pill-shaped everywhere.
- **Elevation:** on dark, lift comes from surface lightness first, then a soft warm-black shadow. `--shadow-1: 0 1px 2px rgb(0 0 0 / .4)`, `--shadow-2: 0 8px 24px -8px rgb(0 0 0 / .5)`. The **hearth glow** (a soft radial gold light) appears **once**, behind the hero mark. It is not a per-card effect (the old card-glow is gone).

## Motion

Intentional, ease-out (expo/quart), never bounce or elastic. A gentle warm fade-and-rise on first load, staggered where a list earns it, playing over already-visible content (no visibility gated on transitions). The one deliberate flourish is **the match reveal**: a small warm bloom of light when a participant opens who they have. Every animation has a `prefers-reduced-motion: reduce` alternative (crossfade or instant). No snow, no twinkle, no perpetual motion.

## Components

- **Buttons:** primary = solid pine with white text; secondary = ink outline on transparent; ghost = text + hover wash. Gold reserved for focus ring and the occasional inline link, not button fills.
- **Inputs:** `--surface-raised` field, hairline border, gold focus ring, label above, generous 44px+ target.
- **Cards / panels:** `--surface` with a soft border. No default glow, no nested cards.
- **Badges / pills:** tinted-transparent (colour at low alpha + coloured text), not saturated fills — except status that needs weight, which uses the semantic fill with correct text.
- **Match reveal:** the one hero moment — display type, the recipient's name, a warm bloom, their wishlist beneath.

## Imagery & icon

Type-led, not photographic (this is a family tool, not a hotel). The landing hero uses **one crafted mark** (a warm evergreen / candle-flame / wrapped-gift motif as SVG or canvas with the gold glow), never emoji, never stock snow. Icons: a clean line set (Lucide-style) in ink/muted, gold only for emphasis. The literal santa emoji logo inherited from the fork is up for review against this direction (a crafted wordmark may fit warm-hearth better) — confirm visually with the organiser.

## Accessibility

WCAG AA floor, AAA on body where feasible. Never colour alone (pair with icon/text/weight). 44px+ targets. Full reduced-motion paths. Focus visible everywhere (gold ring). Test on a small phone at arm's length in bright light.
