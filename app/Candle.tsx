/**
 * A candle: a warm pool of light that never sits still.
 *
 * Three nested spans, not one, and that is the entire point. A single flicker
 * keyframe always comes back to the same place every N seconds and the eye picks
 * the loop up straight away, however uneven you make the stops. Here each layer
 * runs its own irregular flicker on a period that shares no common factor with
 * the others, their opacities multiply, and the result does not visibly repeat.
 * The keyframes and the periods live in globals.css under `.candle`.
 *
 * `tone="hearth"` sits behind the landing hero. `tone="page"` sits at the top of
 * the signed-in pages and washes down. There is exactly ONE per page, on purpose.
 * It went through a spell sitting directly behind the matched name, and then
 * washing the match card, and both were wrong for the same reason: the name is a
 * coal radiating its own red heat, so a second light in the same place at the same
 * scale fights it rather than adding to it. One fire in the room, one coal in it.
 *
 * The two tones run on different periods so they never fall into step, and the
 * bigger the light the gentler it flickers: a large soft wash swinging as hard as
 * a small flame makes the whole page throb.
 *
 * Purely decorative, so it is hidden from assistive tech and inert to the pointer.
 */

export default function Candle({ tone = "page" }: { tone?: "page" | "hearth" }) {
  // Both class strings are written out in FULL, deliberately. Tailwind finds the
  // classes it must keep by plain-text scanning the source, so a name built by
  // interpolation (`candle--${tone}`) produces a literal that appears nowhere, and
  // Tailwind quietly purges `.candle--page` / `.candle--hearth` from the build.
  // Those rules carry the width, so the candle ships as a 0x0 box and the light
  // silently disappears. Do not "tidy" this back into a template string.
  const cls = tone === "hearth" ? "candle candle--hearth" : "candle candle--page";

  return (
    <span className={cls} aria-hidden>
      <span className="candle-jitter">
        <span className="candle-light" />
      </span>
    </span>
  );
}
