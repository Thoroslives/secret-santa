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
    <div className="min-h-screen flex items-center justify-center bg-santa-dark p-4">
      <div className="bg-[#151528] p-8 rounded-2xl border border-white/10 card-glow w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🎅</div>
          <h1 className="text-3xl font-bold text-santa-red mb-2 font-display">Admin Portal</h1>
        </div>

        <LoginForm enabled={isOidcConfigured()} breakGlass={isBreakGlassConfigured()} />

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-santa-gold transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
