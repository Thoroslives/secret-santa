import Link from "next/link";
import { isOidcConfigured } from "@/lib/oidc";
import { isBreakGlassConfigured } from "@/lib/adminAuth";
import LoginForm from "./LoginForm";

// Server component: the two login methods (OIDC availability, break-glass
// availability) are derived from env at request time, never baked into a
// static build - hence force-dynamic below. All interactivity (the OIDC
// button navigation, the break-glass form, the ?error= mapping) lives in the
// client LoginForm.
export const dynamic = "force-dynamic";

export default function AdminLogin() {
  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-santa-dark p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-elev-2">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 h-px w-10 bg-accent-dim" />
          <h1 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink-strong">
            Admin Portal
          </h1>
        </div>

        <LoginForm enabled={isOidcConfigured()} breakGlass={isBreakGlassConfigured()} />

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-ink-muted hover:text-accent-text transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
