import Link from "next/link";

export default function Home() {
  const faqs = [
    {
      q: "How does the Secret Santa Generator work?",
      a: "It's simple! Create a group and set an admin password. Then add participants with their names and optional email addresses. Share the invite code with your group. Each person logs in to create their wishlist. When everyone is ready, the admin clicks one button to generate random assignments. Each participant then sees who they're buying for and can view their recipient's wishlist."
    },
    {
      q: "Is my Secret Santa assignment kept private and secret?",
      a: "Absolutely. Each participant can only see their own Secret Santa assignment when they log in with their unique code. Other participants cannot see who is buying for whom. The admin can view all assignments for management purposes, but regular participants only see their own assigned recipient."
    }
  ];

  return (
    <div className="min-h-screen bg-santa-dark text-santa-snow overflow-x-hidden">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-[10%] text-4xl animate-twinkle">*</div>
          <div className="absolute top-20 left-[30%] text-2xl animate-twinkle" style={{ animationDelay: '0.5s' }}>*</div>
          <div className="absolute top-8 left-[50%] text-3xl animate-twinkle" style={{ animationDelay: '1s' }}>*</div>
          <div className="absolute top-16 left-[70%] text-2xl animate-twinkle" style={{ animationDelay: '1.5s' }}>*</div>
          <div className="absolute top-12 left-[90%] text-4xl animate-twinkle" style={{ animationDelay: '0.3s' }}>*</div>
        </div>

        <div className="container mx-auto px-4 py-20 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="text-7xl mb-6">🎅</div>
            <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-6 font-display">
              <span className="text-santa-red">Secret</span>{" "}
              <span className="text-santa-green">Santa</span>{" "}
              <span className="text-santa-gold">Generator</span>
            </h1>
            <p className="text-lg sm:text-2xl md:text-3xl text-santa-gold mb-4 font-semibold">
              Gift Exchange Organizer
            </p>
            <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed">
              Create a Secret Santa exchange for your family, friends, or office.
              Random assignments, wishlists, no registration required.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-6">
              <Link
                href="/create"
                className="group bg-gradient-to-br from-santa-green to-santa-green-dark p-8 rounded-2xl card-glow transition-all duration-300 hover:scale-105"
              >
                <div className="text-5xl mb-4">🎄</div>
                <h2 className="text-2xl font-bold text-white mb-2">Create New Group</h2>
                <p className="text-green-100 mb-3 text-sm">
                  Start a new Secret Santa event for your family, friends, or coworkers
                </p>
                <span className="text-santa-gold font-semibold group-hover:underline">
                  Get Started &rarr;
                </span>
              </Link>

              <Link
                href="/join"
                className="group bg-gradient-to-br from-santa-red to-santa-red-dark p-8 rounded-2xl card-glow transition-all duration-300 hover:scale-105"
              >
                <div className="text-5xl mb-4">🎁</div>
                <h2 className="text-2xl font-bold text-white mb-2">Join Existing Group</h2>
                <p className="text-red-100 mb-3 text-sm">
                  Have an invite code? Join your family&apos;s or office gift exchange group
                </p>
                <span className="text-santa-gold font-semibold group-hover:underline">
                  Join Now &rarr;
                </span>
              </Link>
            </div>

            <Link
              href="/login"
              className="inline-block text-sm text-gray-400 hover:text-santa-gold transition-colors"
            >
              Participant Login
            </Link>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-santa-gold/30 to-transparent"></div>
      </header>

      {/* FAQ Section */}
      <section className="py-20 bg-[#151528]" aria-labelledby="faq-heading">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 id="faq-heading" className="text-2xl sm:text-4xl md:text-5xl font-bold mb-4 font-display">
              Frequently Asked <span className="text-santa-red">Questions</span>
            </h2>
          </div>

          <div className="max-w-4xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <details
                key={index}
                className="group bg-santa-dark rounded-xl border border-white/5 overflow-hidden"
              >
                <summary className="cursor-pointer p-6 flex items-center justify-between font-semibold text-santa-snow hover:text-santa-gold transition-colors">
                  <span className="pr-4">{faq.q}</span>
                  <span className="text-santa-gold flex-shrink-0 text-xl group-open:rotate-45 transition-transform duration-200">+</span>
                </summary>
                <div className="px-6 pb-6 text-gray-400 leading-relaxed border-t border-white/5 pt-4">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0F0F1E] py-12 border-t border-white/5">
        <div className="container mx-auto px-4">
          <nav aria-label="Footer navigation" className="flex flex-wrap justify-center gap-6 mb-6">
            <Link href="/create" className="text-gray-400 hover:text-santa-gold transition-colors text-sm">Create Group</Link>
            <Link href="/join" className="text-gray-400 hover:text-santa-gold transition-colors text-sm">Join Group</Link>
            <Link href="/login" className="text-gray-400 hover:text-santa-gold transition-colors text-sm">Participant Login</Link>
          </nav>

          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-gray-500 text-sm">
              &copy; {new Date().getFullYear()} Secret Santa
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
