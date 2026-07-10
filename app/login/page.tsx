"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Get groupId from sessionStorage (set during join flow)
    const storedGroupId = sessionStorage.getItem("groupId");
    const storedGroupName = sessionStorage.getItem("groupName");

    if (!storedGroupId) {
      router.push("/");
      return;
    }

    setGroupId(storedGroupId);
    setGroupName(storedGroupName || "Your Group");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSent(false);
    setLoading(true);

    if (!groupId) {
      setError("No group selected. Please start over.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/email-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), groupId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send login link");
        setLoading(false);
        return;
      }

      setSent(true);
      setLoading(false);
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-santa-dark p-4">
      <div className="bg-[#151528] p-8 rounded-2xl border border-white/10 card-glow w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🎅</div>
          <h1 className="text-3xl font-bold text-santa-gold mb-2 font-display">Welcome!</h1>
          {groupName && (
            <p className="text-santa-snow mb-1 font-semibold">{groupName}</p>
          )}
          <p className="text-gray-400 text-sm">
            Enter your email and we&apos;ll send you your login link
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-santa-dark border border-white/10 rounded-lg focus:ring-2 focus:ring-santa-gold focus:border-transparent text-santa-snow placeholder-gray-500"
                placeholder="your.email@example.com"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the email address the admin added for you
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || email.length === 0}
              className="w-full bg-santa-green text-white py-3 rounded-xl font-semibold hover:bg-santa-green-dark transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transform"
            >
              {loading ? "Sending..." : "Send Login Link"}
            </button>
          </form>
        ) : (
          <div className="bg-santa-green/10 border border-santa-green/30 text-santa-green px-4 py-3 rounded-lg">
            <div className="flex items-center">
              <span className="text-santa-green mr-2">&#10003;</span>
              Check your email!
            </div>
            <p className="text-sm mt-2 text-gray-400">
              If that email is registered for this group, we&apos;ve sent a login link to it.
              Click the link in the email to reach your wishlist.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-santa-red/10 border border-santa-red/30 text-santa-red px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-santa-gold transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
