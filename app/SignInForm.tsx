"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "sent";

/**
 * Participant self-service sign-in: enter email, we email the durable
 * /p/<token> link. The /api/auth/email-link route looks the person up by
 * email alone (across every group they belong to) and always returns the same
 * generic outcome, so it never reveals whether an address is registered
 * (enumeration-safe).
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      await fetch("/api/auth/email-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // swallow — the outcome shown is always generic
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div
        className="mx-auto w-full max-w-sm rounded-md border border-primary/40 bg-primary/10 p-5 text-left"
        role="status"
      >
        <p className="font-medium text-ink-strong">Check your email</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          If that address is on this year&apos;s list, your personal link is on its
          way. Tap it to reach your wishlist.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-3 text-left"
    >
      <label htmlFor="email" className="text-sm font-medium text-ink">
        Your email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-sm border border-border bg-raised px-4 py-3 text-ink placeholder:text-ink-muted/60 transition-colors focus:border-accent"
      />
      <button
        type="submit"
        disabled={status === "loading" || email.length === 0}
        className="mt-1 w-full rounded-sm bg-primary px-4 py-3 font-semibold text-primary-on shadow-elev-1 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading" ? "Sending..." : "Email me my link"}
      </button>
      <p className="text-xs text-ink-muted">
        Use the address the organiser added for you.
      </p>
    </form>
  );
}
