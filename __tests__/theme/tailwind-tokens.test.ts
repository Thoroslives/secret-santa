import defaultTheme from "tailwindcss/defaultTheme";

import config from "@/tailwind.config";

/**
 * Guards a real footgun we hit once: a colour token whose name matches a
 * Tailwind default font-size key. Both plugins own the `text-` prefix, so
 * e.g. a colour named `base` makes `text-base` emit BOTH a font-size and a
 * `color`. The stray colour then silently overrides intended text colours
 * wherever `text-base` (or a responsive `sm:text-base`) is used for sizing.
 * That is exactly what turned the admin group picker's text dark on desktop
 * while it stayed correct on mobile (the sm: breakpoint gates when it bites).
 */
describe("tailwind theme tokens", () => {
  it("no custom colour token collides with a Tailwind font-size key", () => {
    const colours = (config.theme?.extend as { colors?: Record<string, unknown> })?.colors ?? {};
    const fontSizeKeys = Object.keys(defaultTheme.fontSize ?? {});
    expect(fontSizeKeys.length).toBeGreaterThan(0); // guard against an empty import silently passing

    const collisions = Object.keys(colours).filter((name) => fontSizeKeys.includes(name));
    expect(collisions).toEqual([]);
  });
});
