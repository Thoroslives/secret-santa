/**
 * The brand mark: the evergreen on the landing hero, in the tab favicon, in the
 * PWA and apple-touch icons, and on the Unraid tile.
 *
 * This file is the single source of that geometry. The icon files under
 * `app/icon.svg` and `public/icons/` are checked against it by
 * `__tests__/theme/app-icons.test.ts`, so redrawing the tree here without
 * regenerating those files fails the suite on purpose — that drift is exactly
 * what left the app with three different icons before.
 *
 * Colours are literal oklch() rather than Tailwind tokens because the icon
 * files have to carry the same fills as plain SVG, where no token exists.
 */
export default function FirMark({
  className,
  decorative = false,
}: {
  className?: string;
  /** Set where an adjacent wordmark already names the app, so a screen reader
   *  doesn't read the brand twice. */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 60"
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Evergreen mark"}
      aria-hidden={decorative || undefined}
      fill="none"
    >
      {/* trunk */}
      <rect x="21" y="50" width="6" height="8" rx="1" fill="oklch(0.380 0.030 60)" />
      {/* tiers, deepening downward for a little dimension */}
      <polygon points="24,31 8,50 40,50" fill="oklch(0.500 0.100 150)" />
      <polygon points="24,20 12,38 36,38" fill="oklch(0.560 0.105 150)" />
      <polygon points="24,11 16,25 32,25" fill="oklch(0.610 0.110 150)" />
      {/* gold star */}
      <path
        d="M24 2 L26 7 L31 8 L26 9 L24 14 L22 9 L17 8 L22 7 Z"
        fill="oklch(0.800 0.120 82)"
      />
    </svg>
  );
}
