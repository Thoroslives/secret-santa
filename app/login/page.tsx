import Link from "next/link";
import { SignInForm } from "@/app/SignInForm";
import Candle from "@/app/Candle";
import Embers from "@/app/Embers";

// /login - standalone self-service sign-in. The landing (app/page.tsx) hosts the
// same <SignInForm/>, but this route stays as the durable target for the
// /p/<token> invalid-link redirect (app/p/[token]/route.ts -> /login?error=
// invalid-link) and for anyone who bookmarks or types /login directly. A server
// component so it can read the ?error param; the form itself is the shared
// client island, which posts email-only (no group context - the invite-code
// /join flow that used to set a groupId is gone).
export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const invalidLink = searchParams?.error === "invalid-link";

  return (
    <main className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-canvas p-4">
      {/* Participant-facing: an expired link lands here, between the lit landing and
          the lit wishlist. Without this it was the one dark room in the house. */}
      <div className="room-vignette" aria-hidden />
      <Candle tone="page" />
      <Embers />

      <div className="relative z-10 w-full max-w-md rounded-md border border-border bg-surface p-8 shadow-elev-2">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 h-px w-10 bg-accent-dim" />
          <h1 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink-strong">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Enter your email and we&apos;ll send your personal link.
          </p>
        </div>

        {invalidLink && (
          <div
            className="mb-5 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
            role="alert"
          >
            That link didn&apos;t work anymore. Enter your email and we&apos;ll
            send you a fresh one.
          </div>
        )}

        <SignInForm />

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-ink-muted transition-colors hover:text-accent-text"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
