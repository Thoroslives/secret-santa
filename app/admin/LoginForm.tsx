"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface LoginFormProps {
  enabled: boolean;
  breakGlass: boolean;
}

// Fixed enum the OIDC callback redirects with on failure (see
// app/api/admin/oidc/{login,callback}/route.ts) - never render the raw
// ?error= value, only these mapped, known-safe messages. A Map (not a plain
// object) is deliberate and must stay one: errorParam is attacker-controlled
// query-string input, and an object lookup like ERROR_MESSAGES["__proto__"]
// or ["constructor"] resolves up the prototype chain to a truthy value that
// React then tries to render as a child ("Objects are not valid as a React
// child") -> HTTP 500 for any unauthed visitor. Map.get() only ever returns
// a real entry or undefined, so unknown input reliably shows no error.
const ERROR_MESSAGES = new Map<string, string>([
  ["oidc_unavailable", "Sign-in with NorthAuth is unavailable right now."],
  ["not_authorized", "That account is not allowed to administer this app."],
  ["oidc_failed", "Sign-in failed. Please try again."],
  ["oidc_state", "Your sign-in session expired. Please try again."],
]);

export default function LoginForm({ enabled, breakGlass }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // When OIDC is the only method on offer, break-glass IS the fallback, so
  // show its form open immediately instead of hiding it behind a reveal.
  const [showBreakGlass, setShowBreakGlass] = useState(!enabled);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!enabled && !breakGlass) {
    return (
      <div className="text-center text-gray-400">
        <p>No admin sign-in method is configured.</p>
        <p className="text-sm mt-2">
          Set ADMIN_BREAKGLASS_PASSWORD and/or the OIDC environment variables.
        </p>
      </div>
    );
  }

  const errorParam = searchParams.get("error");
  const oidcError = errorParam ? ERROR_MESSAGES.get(errorParam) : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      {oidcError && (
        <div className="bg-santa-red/10 border border-santa-red/30 text-santa-red px-4 py-3 rounded-lg mb-6">
          {oidcError}
        </div>
      )}

      {enabled && (
        // Real navigation (not fetch) - this kicks off a server redirect to
        // the IdP, it is not an API call the client can await.
        <a
          href="/api/admin/oidc/login"
          className="w-full block text-center bg-santa-red text-white py-3 rounded-xl font-semibold hover:bg-santa-red-dark transition-all duration-300 hover:scale-105 transform"
        >
          Sign in with NorthAuth
        </a>
      )}

      {breakGlass && (
        <div className={enabled ? "mt-6" : ""}>
          {enabled && !showBreakGlass && (
            <button
              type="button"
              onClick={() => setShowBreakGlass(true)}
              className="w-full text-sm text-gray-400 hover:text-santa-gold transition-colors text-center"
            >
              Use break-glass password
            </button>
          )}

          {showBreakGlass && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-santa-dark border border-white/10 rounded-lg focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                  placeholder="Enter admin password"
                  required
                />
              </div>

              {error && (
                <div className="bg-santa-red/10 border border-santa-red/30 text-santa-red px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-santa-red text-white py-3 rounded-xl font-semibold hover:bg-santa-red-dark transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transform"
              >
                {loading ? "Authenticating..." : "Login"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
