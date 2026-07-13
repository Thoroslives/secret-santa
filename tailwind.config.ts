import type { Config } from "tailwindcss";

/**
 * Warm-hearth design system. One committed theme: deep warm-charcoal base,
 * pine-green primary (the action colour), gold accent (glow / focus / marks).
 * OKLCH throughout, with <alpha-value> so opacity utilities (bg-primary/10) work.
 * See DESIGN.md for the rationale and contrast rules.
 */
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Named `canvas`, not `base`: a colour token called `base` collides
        // with Tailwind's `text-base` font-size utility (both own `text-`),
        // which silently injects this colour wherever `text-base` is used for
        // sizing. See __tests__/theme/tailwind-tokens.test.ts.
        canvas: "oklch(0.170 0.014 55 / <alpha-value>)",
        surface: "oklch(0.215 0.016 55 / <alpha-value>)",
        raised: "oklch(0.255 0.018 55 / <alpha-value>)",
        border: {
          DEFAULT: "oklch(0.320 0.016 55 / <alpha-value>)",
          strong: "oklch(0.400 0.018 55 / <alpha-value>)",
        },
        ink: {
          DEFAULT: "oklch(0.940 0.012 85 / <alpha-value>)",
          strong: "oklch(0.975 0.008 85 / <alpha-value>)",
          muted: "oklch(0.720 0.014 78 / <alpha-value>)",
        },
        primary: {
          DEFAULT: "oklch(0.560 0.105 150 / <alpha-value>)",
          hover: "oklch(0.610 0.110 150 / <alpha-value>)",
          press: "oklch(0.500 0.100 150 / <alpha-value>)",
          on: "oklch(0.985 0.010 150 / <alpha-value>)",
        },
        // The heat of the fire, for the match reveal and nothing else.
        //
        // This is NOT santa-red, and the difference is the whole point: the
        // anti-reference is the reflexive red-and-GREEN pairing, not red itself.
        // A hearth's hottest light IS red, so a hot-coal red belongs in this
        // theme in a way a pillarbox red never would. Kept clearly apart from
        // `danger` (a duller brick at 0.620/0.150/32, which means "you are about
        // to break something" and must not be confused with a person's name):
        // this is lighter, hotter and more saturated.
        //
        // 6.5:1 on the canvas, measured, not guessed. On a dark base a red has
        // to be light to be legible at all, so it is held as red as it can be
        // while still clearing the bar for the older eyes this is built for.
        ember: {
          DEFAULT: "oklch(0.700 0.200 35 / <alpha-value>)",
          hot: "oklch(0.820 0.150 45 / <alpha-value>)",
          glow: "oklch(0.660 0.190 33 / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(0.800 0.120 82 / <alpha-value>)",
          text: "oklch(0.850 0.130 84 / <alpha-value>)",
          dim: "oklch(0.680 0.100 82 / <alpha-value>)",
        },
        success: "oklch(0.700 0.130 150 / <alpha-value>)",
        danger: {
          DEFAULT: "oklch(0.620 0.150 32 / <alpha-value>)",
          on: "oklch(0.985 0.010 32 / <alpha-value>)",
        },
        warning: "oklch(0.780 0.130 68 / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
      },
      boxShadow: {
        "elev-1": "0 1px 2px rgb(0 0 0 / 0.4)",
        "elev-2": "0 8px 24px -8px rgb(0 0 0 / 0.5)",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        bloom: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        bloom: "bloom 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
