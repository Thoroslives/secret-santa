import Link from "next/link";
import { SignInForm } from "./SignInForm";
import Candle from "./Candle";
import Embers from "./Embers";

function FirMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 60"
      className={className}
      role="img"
      aria-label="Evergreen mark"
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

export default function Home() {
  return (
    <main className="relative min-h-[100svh] overflow-hidden">
      <div className="room-vignette" aria-hidden />
      <Embers />

      <section className="relative z-10 mx-auto flex min-h-[100svh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="hearth-glow reveal flex flex-col items-center">
          <Candle tone="hearth" />
          <FirMark className="relative z-[1] mb-7 h-16 w-auto" />
          <h1 className="relative z-[1] text-balance font-display text-[clamp(2.6rem,8.5vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink-strong">
            A family tradition
            <br />
            <span className="text-accent-text">Secret Santa</span>
          </h1>
          <p className="relative z-[1] mt-6 max-w-md text-pretty text-lg leading-relaxed text-ink-muted">
            Sign in with your email and we&apos;ll send your link, add a
            wishlist, and see who you&apos;re buying for.
          </p>
        </div>

        <div className="relative z-[1] mt-11 w-full">
          <SignInForm />
        </div>

        <p className="hidden" aria-hidden="true"></p>
      </section>

      <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center pb-6">
        <Link
          href="/admin"
          className="text-sm text-ink-muted transition-colors hover:text-accent-text"
        >
          Organiser sign-in
        </Link>
      </div>
    </main>
  );
}
