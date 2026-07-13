/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      {
        // /login used to be a second sign-in page hosting the very same
        // <SignInForm/> the landing already has. Nothing linked to it: the
        // wishlist bounces signed-out visitors to /, and the emails only ever
        // send people to /p/<token>. It existed to show one error banner, which
        // the landing now shows itself. Kept as a redirect so old bookmarks and
        // the README's links don't 404.
        //
        // Not `permanent`: a 308 is cached hard by browsers, and there is no SEO
        // reason to want one (the whole app is robots: noindex), so a 307 costs
        // nothing and keeps the route reusable if we ever want it back.
        source: '/login',
        destination: '/',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
