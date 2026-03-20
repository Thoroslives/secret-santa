"use client";

import { useState } from "react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "R0",
    priceDetail: "Forever free",
    features: [
      "1 group",
      "Up to 10 participants",
      "Basic wishlist (3 items)",
      "Manual assignments",
    ],
    cta: "Get Started",
    ctaLink: "/create",
    highlighted: false,
    icon: "🎁",
  },
  {
    name: "Santa Plus",
    price: "R29",
    priceDetail: "per season (≈$1.50 USD)",
    features: [
      "Unlimited groups",
      "Up to 50 participants per group",
      "Extended wishlist (10 items with images)",
      "Email notifications when assigned",
      "Budget tracking per group",
      "Priority support",
    ],
    cta: "Upgrade to Plus",
    highlighted: true,
    plan: "plus",
    icon: "⭐",
  },
  {
    name: "Santa Pro",
    price: "R79",
    priceDetail: "per season (≈$4 USD)",
    features: [
      "Everything in Plus",
      "Unlimited participants",
      "Custom group branding",
      "Exclusion rules (who can't get who)",
      "Gift budget limits",
      "CSV export",
      "API access",
    ],
    cta: "Upgrade to Pro",
    highlighted: false,
    plan: "pro",
    icon: "🏆",
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (plan: string) => {
    setLoading(plan);
    const groupId = typeof window !== 'undefined' ? sessionStorage.getItem("groupId") : null;

    if (!groupId) {
      alert("Please create or join a group first.");
      setLoading(null);
      return;
    }

    try {
      const priceId = plan === "plus"
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PLUS
        : process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO;

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, groupId, plan }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start checkout");
      }
    } catch {
      alert("An error occurred. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-santa-dark to-[#1a0a0a]">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-12">
          <Link href="/" className="text-2xl font-bold text-white flex items-center gap-2">
            🎅 Secret Santa
          </Link>
          <Link href="/" className="text-white/80 hover:text-white transition">
            ← Back to Home
          </Link>
        </div>

        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Simple, Affordable Pricing
          </h1>
          <p className="text-xl text-white/70 max-w-2xl mx-auto">
            Start free, upgrade when you need more. Cheap enough that everyone can afford it.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 ${
                plan.highlighted
                  ? "bg-gradient-to-b from-santa-red to-red-700 text-white ring-4 ring-santa-gold scale-105"
                  : "bg-white/10 text-white border border-white/20"
              }`}
            >
              <div className="text-4xl mb-4">{plan.icon}</div>
              <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
              <div className="mb-1">
                <span className="text-4xl font-bold">{plan.price}</span>
              </div>
              <p className={`text-sm mb-6 ${plan.highlighted ? "text-white/80" : "text-white/60"}`}>
                {plan.priceDetail}
              </p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="text-santa-gold mt-0.5">✓</span>
                    <span className={plan.highlighted ? "text-white/90" : "text-white/70"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.ctaLink ? (
                <Link
                  href={plan.ctaLink}
                  className={`block w-full py-3 rounded-lg font-semibold text-center transition ${
                    plan.highlighted
                      ? "bg-white text-santa-red hover:bg-gray-100"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {plan.cta}
                </Link>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.plan!)}
                  disabled={loading === plan.plan}
                  className={`w-full py-3 rounded-lg font-semibold transition disabled:opacity-50 ${
                    plan.highlighted
                      ? "bg-white text-santa-red hover:bg-gray-100"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {loading === plan.plan ? "Loading..." : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4 text-left">
            <div className="bg-white/10 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">When does my season expire?</h3>
              <p className="text-white/70">Your plan lasts for one full holiday season (1 year from purchase). Perfect for annual gift exchanges.</p>
            </div>
            <div className="bg-white/10 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Can I upgrade mid-season?</h3>
              <p className="text-white/70">Yes! You can upgrade at any time. Your new features are available immediately.</p>
            </div>
            <div className="bg-white/10 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Is my payment secure?</h3>
              <p className="text-white/70">Absolutely. All payments are processed through Stripe, a PCI-compliant payment processor trusted by millions.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="container mx-auto px-4 text-center text-white/50">
          <p>© {new Date().getFullYear()} Secret Santa Generator •
            <Link href="/" className="text-santa-gold hover:text-santa-gold/80 ml-1">
              santa.wagnerway.co.za
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
