import type { CSSProperties } from "react";

/**
 * Sparks lifting off the matched name.
 *
 * The name is the hottest thing on the page, so it throws embers the way a coal
 * does. Deliberately few (10) and short-lived (~100px of travel): this sits on
 * top of the one piece of information the whole app exists to deliver, so it has
 * to stay a suggestion of heat rather than a fireworks display. They render
 * BEHIND the glyphs (see .name-embers / .match-reveal-name z-index in
 * globals.css), so the name can never be obscured by its own decoration.
 *
 * This lives INSIDE the name span, not the paragraph. The paragraph is a
 * full-width block, so sparks positioned against it would scatter across the
 * whole card rather than coming off the letters.
 *
 * Fixed table, not Math.random(): random values here would differ between the
 * server and client render and desync hydration. Negative delays so the sparks
 * are already in flight on the first frame rather than starting from nothing.
 */

const PATHS = ["name-ember-a", "name-ember-b", "name-ember-c"];

const SPARKS = [
  { left: "6%", bottom: "18%", size: 3, delay: "-1.2s", duration: "4.4s" },
  { left: "14%", bottom: "34%", size: 2, delay: "-3.6s", duration: "5.8s" },
  { left: "23%", bottom: "10%", size: 2, delay: "-0.4s", duration: "3.9s" },
  { left: "31%", bottom: "46%", size: 3, delay: "-4.8s", duration: "6.2s" },
  { left: "39%", bottom: "22%", size: 2, delay: "-2.1s", duration: "4.7s" },
  { left: "48%", bottom: "38%", size: 2, delay: "-5.3s", duration: "5.1s" },
  { left: "56%", bottom: "14%", size: 3, delay: "-0.9s", duration: "6.6s" },
  { left: "64%", bottom: "42%", size: 2, delay: "-3.1s", duration: "4.2s" },
  { left: "73%", bottom: "26%", size: 2, delay: "-1.7s", duration: "5.5s" },
  { left: "82%", bottom: "30%", size: 3, delay: "-4.2s", duration: "4.9s" },
];

export default function NameEmbers() {
  return (
    <span className="name-embers" aria-hidden>
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="name-ember"
          style={
            {
              left: s.left,
              bottom: s.bottom,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animationName: PATHS[i % PATHS.length],
              animationDelay: s.delay,
              animationDuration: s.duration,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
