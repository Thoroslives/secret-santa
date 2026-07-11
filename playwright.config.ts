import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// This container is Alpine/musl; the Chromium build Playwright downloads is
// glibc-linked and can't execute here. Fall back to the Alpine-native system
// Chromium when present, otherwise let Playwright use its own managed browser.
const alpineChromium = '/usr/bin/chromium';
const chromiumExecutablePath = fs.existsSync(alpineChromium)
  ? alpineChromium
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // The app registers a real service worker (public/sw.js) that re-fetches
    // GET /api/* requests from within its own fetch handler. That bypasses
    // page.route() mocking, so block service workers for deterministic tests.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumExecutablePath
          ? { executablePath: chromiumExecutablePath }
          : {},
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      // Break-glass admin login (app/admin) is gated server-side on
      // isBreakGlassConfigured() - a non-empty value here is required for
      // the "Admin Portal Login" e2e block to ever see the password field.
      // OIDC env is deliberately left unset so the SSO button stays hidden
      // and no real IdP discovery is attempted during e2e. Test-only value,
      // never a real credential.
      ADMIN_BREAKGLASS_PASSWORD: 'e2e-break-glass-not-a-real-secret',
    },
  },
});
