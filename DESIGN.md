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
  --ember:          oklch(0.700 0.200 35);   /* the coal — the match-reveal name, and nothing else */
  --ember-hot:      oklch(0.820 0.150 45);   /* spark cores */
  --ember-glow:     oklch(0.660 0.190 33);   /* spark halo */

  --danger:         oklch(0.620 0.150 32);   /* warm brick, NOT santa-red */
  --on-danger:      oklch(0.985 0.010 32);
  --warning:        oklch(0.780 0.130 68);   /* amber, used rarely */

  --focus:          var(--accent);           /* gold focus ring */
}
```

Rules that bite here: ink-vs-bg stays ≥7:1; the pine primary takes **white** text on fills (Helmholtz-Kohlrausch, mid-luminance saturated); the gold accent is **never a text-bearing fill** (its L sits below the pale-fill threshold), so gold is used as thin rules, focus rings, icon marks, a single hero glow, and gold-coloured text on the dark base, never as a filled button behind label text. Primary vs accent are distinct in both hue (150 vs 82) and lightness (0.56 vs 0.80).

**On the ember red, because it looks like a rule being broken and is not.** The anti-reference is the reflexive red-**and-green** pairing, not red itself. A hearth's hottest light *is* red, so a hot-coal red is native to this theme where a pillarbox santa-red would be foreign to it. Two constraints keep it honest:

- **It belongs to exactly one thing: the matched name, and the sparks off it.** The moment it appears anywhere else it stops being heat and starts being decoration.
- **It is not `--danger`.** Danger is a duller brick and means *you are about to break something*; ember is lighter, hotter and more saturated. A person's name must never wear the colour of a destructive action.

Contrast is *computed*, not eyed, because on a dark base a red has to be light to be legible at all, and pushing it redder trades away contrast. Ember sits at 6.5:1 on the canvas. It is also animated (see Motion), so the floor that matters is the **dimmest point of the coldest part of its cycle**, which is held at ~4.4:1: it cools, it never goes out.

## Typography

Voice words: **warm, crafted, intimate** (a hand-addressed card). Contrast-axis pairing, both chosen off the reflex-reject list.

- **Display / headings:** a warm characterful serif. Primary pick **Hedvig Letters Serif**; fallbacks Piazzolla or Young Serif. Verify it loads before locking. Used for the hero line, page titles, and the match reveal.
- **Body / UI:** **Hanken Grotesk**, a legible humanist grotesque that reads friendly at small sizes on a phone. Fallback Schibsted Grotesk. Carries all interface text, labels, inputs, buttons.
- Never Inter, Georgia, Fraunces, Playfair, Cormorant, DM (reflex-reject / the amateur originals).

Scale: modular ~1.25, base 16px. Headings fluid `clamp()`, display max ≤ 6rem, letter-spacing -0.02em (floor -0.04em), `text-wrap: balance` on h1-h3. Body line-height 1.6 (light-on-dark wants the extra room); long prose `text-wrap: pretty`. Body measure 60-70ch.

## Space, radius, elevation

- **Spacing:** 4px base — 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Vary for rhythm: tight within a group, generous between.
- **Radius:** sm 8 (inputs, buttons) · md 12 (cards) · lg 16 (panels) · full (avatars, small pills). Soft, not pill-shaped everywhere.
- **Elevation:** on dark, lift comes from surface lightness first, then a soft warm-black shadow. `--shadow-1: 0 1px 2px rgb(0 0 0 / .4)`, `--shadow-2: 0 8px 24px -8px rgb(0 0 0 / .5)`. The **hearth glow** (a soft radial gold light) appears **once per page** and never as a per-card effect (the old card-glow is gone). One fire in the room. Adding a second light to a surface that already has one does not make it warmer, it makes both lights weaker — see Motion.

## Motion

Intentional, ease-out (expo/quart), never bounce or elastic. A gentle warm fade-and-rise on first load, staggered where a list earns it, playing over already-visible content (no visibility gated on transitions). Every animation has a `prefers-reduced-motion: reduce` alternative.

**The room is alive.** This doc used to say "no perpetual motion", and that rule is gone on purpose: a candlelit room where nothing moves is a photograph of a candlelit room. There is now a standing ambient layer — a guttering candle, and embers drifting up through it — and the match reveal remains the one moment the page raises its voice.

That is a licence to do one specific thing well, not a licence to animate. It is fenced:

**No snow. Ever.** The reflex is a white-blue flake falling over everything, and it is wrong here twice over: it is the single most recognisable AI-Christmas tell, and we are *inside*, by a fire, in a warm dark room. Snow belongs outside the window, and its colour fights the gold. **The theme's native particle is a rising ember, not a falling flake.** That is the whole difference between atmosphere and kitsch, and it is not negotiable.

**Particles live in the page. Illumination lives on the viewport.** An ember is an object in the room: if it hangs still while the page scrolls past it, it is obviously stuck to the glass. Light is not an object, it is the room *being lit*: a light that scrolls away leaves you reading in the dark below the fold. These are opposite requirements and both are correct. Get them backwards and the whole effect collapses.

**Nothing may visibly repeat.** A single keyframe loop always reads as a pattern, however uneven its stops, because it returns to the same place every N seconds and the eye catches it immediately. Build a light from **layers on periods that share no common factor** (the candle runs three, at 7.3s / 2.9s / 0.97s, and their opacities multiply). More keyframe stops will not save a single loop; more layers will.

**Realism is the shape of the event, not the length of the loop.** A smooth swell is a *breath*, and a breath has a tempo. Fire has none: it sits, and then a draught catches it and it **flares** — a fast rise, a slow fall, at intervals that are not a beat. Asymmetry is the tell that separates a flame from a pulsing UI element.

**Amplitude scales inversely with the size of the light.** A small flame can swing hard and look alive. A large wash swinging as hard makes the whole page throb. The big lights get gentler curves, always.

**One light per place.** Two sources at the same position and the same scale fight rather than add up; the match name is a coal radiating its own heat, so nothing else may light it. Separate lights by scale, or drop one.

**Never animate `text-shadow`.** It forces a layout on every frame in Chrome — even when the blur radii do not change — where an identical colour-only animation costs nothing. Modulate a glow with `filter: brightness()` on the parent instead, which lifts the shadow along with the text and is free. Measured, not assumed: the whole signed-in page holds 60fps at **zero layouts** and under 9% of one core at idle, which is the bar for an old phone left open on a kitchen bench.

**Reduced motion must leave the light ON.** Stripping the animation must leave a coal that is *still lit and still*, never one that has gone out. Any glow that lives only inside a keyframe disappears with it, so declare it as a base state. The ambient particles are removed outright — perpetual motion is precisely what the setting is asking us not to run.

## Components

- **Buttons:** primary = solid pine with white text; secondary = ink outline on transparent; ghost = text + hover wash. Gold reserved for focus ring and the occasional inline link, not button fills.
- **Inputs:** `--surface-raised` field, hairline border, gold focus ring, label above, generous 44px+ target.
- **Cards / panels:** `--surface` with a soft border. No default glow, no nested cards.
- **Badges / pills:** tinted-transparent (colour at low alpha + coloured text), not saturated fills — except status that needs weight, which uses the semantic fill with correct text.
- **Match reveal:** the one hero moment — display type, the recipient's name in **ember red**, sparks lifting off it, their wishlist beneath. The name is the hottest thing in the app and the only place ember appears. Nothing lights it, because it *is* the light.
- **Sealed state:** before the draw is sent, the same card holds a wax-sealed envelope and a low gold glow, deliberately **dimmer than the reveal**. This is the card most of the family stares at for weeks, so it must give them something to wait for — and the page has to visibly *brighten* when the name finally lands. The gap in brightness between these two states is load-bearing; do not close it.

## Imagery & icon

Type-led, not photographic (this is a family tool, not a hotel). The landing hero uses **one crafted mark** (a warm evergreen / candle-flame / wrapped-gift motif as SVG or canvas with the gold glow), never emoji, never stock snow. Icons: a clean line set (Lucide-style) in ink/muted, gold only for emphasis. The literal santa emoji logo inherited from the fork is up for review against this direction (a crafted wordmark may fit warm-hearth better) — confirm visually with the organiser.

## Accessibility

WCAG AA floor, AAA on body where feasible. Never colour alone (pair with icon/text/weight). 44px+ targets. Full reduced-motion paths. Focus visible everywhere (gold ring). Test on a small phone at arm's length in bright light.
