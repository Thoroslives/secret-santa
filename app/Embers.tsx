import type { CSSProperties } from "react";

/**
 * Embers drifting up through the firelight, over the signed-in pages.
 *
 * This is the in-theme answer to the snow reflex (see PRODUCT.md anti-references):
 * the room is warm and we are inside it, so the particle is a gold ember that
 * rises, not a white flake that falls. It should read as "the fire is lit", never
 * as weather. The presence comes from each ember being genuinely lit and alive (a
 * hot core, a halo, a flicker, a cooling shrink) rather than from flooding the
 * screen with more of them.
 *
 * They are positioned down the PAGE, not the viewport, and the container is
 * absolute rather than fixed, so they scroll with the content. Fixed embers hang
 * motionless on the glass while the page slides under them, which gives the whole
 * thing away as an overlay.
 *
 * The values are a fixed table rather than Math.random() so the server and client
 * render the same markup; randomising here would desync hydration.
 *
 * The rise delays are NEGATIVE on purpose. A positive delay means the ember has
 * not started when you land, so the page would open dead and only fill up half a
 * minute later. A negative delay starts the animation part-way through its cycle,
 * so the embers are already spread up the page on the first frame.
 *
 * Nothing here is uniform: size, colour, speed, path, flicker rate and phase all
 * vary. Uniformity is what makes a particle field look generated.
 */

const PATHS = ["ember-rise-a", "ember-rise-b", "ember-rise-c"];

// Hotter to cooler, all inside the warm band the theme already owns (hue 44-92,
// which sits between the gold accent at 82 and the warm brick danger at 32).
const HEAT = [
  { core: "oklch(0.945 0.070 92)", glow: "oklch(0.840 0.140 78 / 0.55)" },
  { core: "oklch(0.880 0.125 74)", glow: "oklch(0.760 0.150 62 / 0.50)" },
  { core: "oklch(0.800 0.150 56)", glow: "oklch(0.670 0.150 44 / 0.45)" },
];

type Ember = {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
  flickerDur: string;
  flickerDelay: string;
};

const EMBERS: Ember[] = [
  { left: "4%", top: "6%", size: 3, delay: "-3s", duration: "17s", flickerDur: "1.9s", flickerDelay: "-0.4s" },
  { left: "11%", top: "38%", size: 2, delay: "-12s", duration: "21s", flickerDur: "1.3s", flickerDelay: "-1.1s" },
  { left: "17%", top: "72%", size: 4, delay: "-7s", duration: "15s", flickerDur: "2.4s", flickerDelay: "-0.2s" },
  { left: "23%", top: "18%", size: 2, delay: "-16s", duration: "19s", flickerDur: "1.6s", flickerDelay: "-0.9s" },
  { left: "29%", top: "88%", size: 3, delay: "-5s", duration: "22s", flickerDur: "2.1s", flickerDelay: "-1.5s" },
  { left: "35%", top: "51%", size: 2, delay: "-19s", duration: "16s", flickerDur: "1.1s", flickerDelay: "-0.6s" },
  { left: "41%", top: "9%", size: 3, delay: "-9s", duration: "20s", flickerDur: "2.7s", flickerDelay: "-2.0s" },
  { left: "47%", top: "63%", size: 4, delay: "-14s", duration: "18s", flickerDur: "1.4s", flickerDelay: "-0.3s" },
  { left: "53%", top: "30%", size: 2, delay: "-2s", duration: "23s", flickerDur: "1.8s", flickerDelay: "-1.3s" },
  { left: "58%", top: "94%", size: 3, delay: "-21s", duration: "17s", flickerDur: "2.2s", flickerDelay: "-0.8s" },
  { left: "64%", top: "44%", size: 2, delay: "-6s", duration: "19s", flickerDur: "1.2s", flickerDelay: "-0.5s" },
  { left: "70%", top: "77%", size: 4, delay: "-17s", duration: "21s", flickerDur: "2.5s", flickerDelay: "-1.8s" },
  { left: "75%", top: "14%", size: 3, delay: "-11s", duration: "16s", flickerDur: "1.7s", flickerDelay: "-1.0s" },
  { left: "81%", top: "58%", size: 2, delay: "-4s", duration: "24s", flickerDur: "1.5s", flickerDelay: "-0.7s" },
  { left: "86%", top: "25%", size: 3, delay: "-23s", duration: "18s", flickerDur: "2.0s", flickerDelay: "-1.6s" },
  { left: "91%", top: "83%", size: 2, delay: "-8s", duration: "20s", flickerDur: "1.0s", flickerDelay: "-0.1s" },
  { left: "95%", top: "48%", size: 4, delay: "-15s", duration: "15s", flickerDur: "2.3s", flickerDelay: "-1.2s" },
  { left: "8%", top: "97%", size: 2, delay: "-10s", duration: "22s", flickerDur: "1.6s", flickerDelay: "-1.9s" },
  { left: "44%", top: "84%", size: 3, delay: "-18s", duration: "19s", flickerDur: "2.6s", flickerDelay: "-0.4s" },
  { left: "67%", top: "3%", size: 2, delay: "-13s", duration: "17s", flickerDur: "1.3s", flickerDelay: "-1.4s" },
];

export default function Embers() {
  return (
    <div className="embers" aria-hidden>
      {EMBERS.map((e, i) => {
        const heat = HEAT[i % HEAT.length];
        return (
          <span
            key={i}
            className="ember"
            style={
              {
                left: e.left,
                top: e.top,
                width: `${e.size}px`,
                height: `${e.size}px`,
                animationName: PATHS[i % PATHS.length],
                animationDelay: e.delay,
                animationDuration: e.duration,
                "--ember-core": heat.core,
                "--ember-glow": heat.glow,
                "--ember-flicker-dur": e.flickerDur,
                "--ember-flicker-delay": e.flickerDelay,
              } as CSSProperties
            }
          >
            <span className="ember-core" />
          </span>
        );
      })}
    </div>
  );
}
