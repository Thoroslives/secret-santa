import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the icon set, which had broken in three ways at once and shipped:
 *
 *  - app/icon.svg drew the favicon as a Santa emoji inside an SVG <text>
 *    element. Whether that draws at all depends on the rasterizer happening to
 *    have an emoji font, so it came out broken in the browser on Android.
 *  - The PWA icons were a different mark entirely (a red gift box on slate), so
 *    the tab, the home screen and the Unraid tile were three unrelated logos.
 *  - manifest.json's theme_color was #EF4444 (red) while the layout's
 *    <meta name="theme-color"> was warm dark. An installed PWA reads the
 *    manifest, so the app got a red status bar and a slate splash screen.
 *
 * Every icon is now the FirMark evergreen from the home page. These keep it so.
 */

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const ICON_SVGS = [
  "app/icon.svg",
  "public/icons/icon-192.svg",
  "public/icons/icon-512.svg",
  "public/icons/icon-maskable-512.svg",
  "public/icons/apple-touch-icon.svg",
];

/** Everything the icon actually draws, minus its background rect. */
function markOf(svg: string): string {
  const group = /<g\b[^>]*>([\s\S]*?)<\/g>/.exec(svg);
  if (!group) throw new Error("icon has no mark group");
  return group[1].replace(/\s+/g, " ").trim();
}

/** Shape geometry only, so a fill written as oklch() vs hex doesn't matter. */
function geometry(svg: string): string[] {
  return [...svg.matchAll(/(?:points|d)="([^"]+)"/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim()
  );
}

describe("app icons", () => {
  it.each(ICON_SVGS)("%s draws vector shapes, never a font glyph", (path) => {
    const svg = read(path);
    // A <text> element only draws if the rasterizer has the font, which is how
    // the emoji favicon broke. Icons must be pure geometry.
    expect(svg).not.toMatch(/<text\b/);
    // Non-ASCII here means a literal emoji or other glyph snuck back in.
    expect(svg).toMatch(/^[\x00-\x7F]*$/);
  });

  it.each(ICON_SVGS)("%s uses hex colours, not oklch()", (path) => {
    // The app is OKLCH throughout, but OS launchers and icon rasterizers are not
    // guaranteed to parse CSS Color 4, and a colour that fails to parse is the
    // same class of bug as the emoji.
    expect(read(path)).not.toMatch(/oklch\(/i);
  });

  it("every icon draws the identical mark", () => {
    const marks = ICON_SVGS.map((path) => markOf(read(path)));
    expect(new Set(marks).size).toBe(1);
  });

  it("that mark is the home page's FirMark, not a lookalike redraw", () => {
    const page = read("app/page.tsx");
    const firMark = page.slice(
      page.indexOf("function FirMark"),
      page.indexOf("export default")
    );
    const homeShapes = geometry(firMark);
    expect(homeShapes.length).toBeGreaterThan(0);

    const iconShapes = geometry(read("app/icon.svg"));
    for (const shape of homeShapes) expect(iconShapes).toContain(shape);
  });
});

describe("manifest", () => {
  const manifest = JSON.parse(read("public/manifest.json")) as {
    theme_color: string;
    icons: { src: string; purpose?: string }[];
  };

  it("theme_color agrees with the meta tag the browser reads", () => {
    const meta = /name="theme-color"\s+content="([^"]+)"/.exec(read("app/layout.tsx"));
    expect(meta).not.toBeNull();
    expect(manifest.theme_color.toLowerCase()).toBe(meta![1].toLowerCase());
  });

  it("declares a maskable icon, and every icon it names exists", () => {
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      expect(existsSync(join(root, "public", icon.src))).toBe(true);
    }
  });
});

it("the apple-touch-icon the layout links exists", () => {
  const href = /rel="apple-touch-icon"\s+href="([^"]+)"/.exec(read("app/layout.tsx"));
  expect(href).not.toBeNull();
  expect(existsSync(join(root, "public", href![1]))).toBe(true);
});
