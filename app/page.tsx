import Link from "next/link";
import { SignInForm } from "./SignInForm";
import Candle from "./Candle";
import Embers from "./Embers";
import FirMark from "./FirMark";

export default function Home({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  // A /p/<token> that matches no active person lands back here. Note these links
  // never expire (lib/email.ts: the same URL for the lifetime of the person), so
  // this is a mistyped or truncated URL, a person the organiser deactivated, or a
  // wiped database. It is never a lapsed link, and the copy must not imply one.
  const invalidLink = searchParams?.error === "invalid-link";

  // The landing is a single-screen doorway and has to stay one, banner or not.
  // Measured: without the banner the page lands at EXACTLY the viewport height on
  // both a 390x844 phone and a 720px-tall laptop window, so it has no slack at all
  // and the banner tips it into scrolling (+29px at 720). The padding is the lever:
  // with `justify-center` and `min-h-[100svh]` this padding only does anything once
  // the content is taller than the screen, so tightening it costs nothing visually
  // at heights that already fit, and buys back the banner's height where it counts.
  //
  // Safe against the Tailwind purge that bit the candle: the danger is a class NAME
  // assembled at runtime (`candle--${tone}`), which never appears in the source for
  // the scanner to find. `py-10` and `py-16` are both written out literally here, so
  // both rules survive the build. Verified in the production build, not just dev.
  const doorway =
    "relative z-10 mx-auto flex min-h-[100svh] max-w-2xl flex-col items-center justify-center px-6 text-center";

  return (
    <main className="relative min-h-[100svh] overflow-hidden">
      <div className="room-vignette" aria-hidden />
      <Embers />

      <section className={invalidLink ? `${doorway} py-10` : `${doorway} py-16`}>
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

        {/* Both class strings are written out in full on purpose. Tailwind picks
            what to keep by plain-text scanning the source, so an interpolated
            className silently purges the rule (see the docs on the candle bug).
            The banner buys its own vertical space back: the landing is a
            single-screen doorway that must not start scrolling on a phone. */}
        <div
          className={
            invalidLink
              ? "relative z-[1] mt-8 w-full"
              : "relative z-[1] mt-11 w-full"
          }
        >
          {invalidLink && (
            // max-w-sm, the same width as SignInForm's own box, so the banner
            // reads as the top of the form rather than a page-wide alert
            // floating above it.
            <div
              role="alert"
              className="mx-auto mb-5 w-full max-w-sm text-pretty rounded-md border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger"
            >
              That link didn&apos;t work. Enter your email and we&apos;ll send a
              fresh one.
            </div>
          )}
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
