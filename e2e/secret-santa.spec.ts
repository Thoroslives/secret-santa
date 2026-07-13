import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Secret Santa/);
  });

  test("shows the participant email sign-in form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel(/Your email/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Email me my link/i })
    ).toBeVisible();
  });

  test("has an organiser sign-in link to /admin", async ({ page }) => {
    await page.goto("/");
    const organiser = page.getByRole("link", { name: /Organiser sign-in/i });
    await expect(organiser).toBeVisible();
    await organiser.click();
    await expect(page).toHaveURL(/\/admin/);
  });
});

// The public "Join Existing Group" invite-code flow (app/join + /api/groups/verify)
// was removed in P5.6: participants no longer self-join with a code - the organiser
// adds them and shares their durable /p/<token> link, and self-service sign-in is
// email-only (see the Participant Sign-In block below). The public "Create Group"
// page was already removed in the P4 follow-ups (group creation is admin-only via
// the dashboard, covered by the POST /api/groups/create tests + the Full Flow below).

// The landing IS the sign-in page. /login used to be a second one hosting this
// same <SignInForm/>; it was consolidated away, because nothing linked to it and
// PRODUCT.md already gives the landing the job ("the public page welcomes and
// signs you in").
test.describe("Participant Sign-In (landing, email link)", () => {
  test("/login redirects to the landing rather than 404ing an old bookmark", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
    // Landed somewhere that can actually sign you in, not just any 200.
    await expect(page.getByLabel(/Your email/i)).toBeVisible();
  });

  test("shows the invalid-link banner on ?error=invalid-link", async ({
    page,
  }) => {
    await page.goto("/?error=invalid-link");
    // Assert the banner's own copy rather than role=alert - next dev injects its
    // own role=alert overlay container, so the role match is ambiguous in dev.
    await expect(page.getByText(/didn.t work/i)).toBeVisible();
  });

  // The landing is a single-screen doorway. Without the banner it lands at EXACTLY
  // the viewport height (measured, on both sizes below), so it carries no slack and
  // the banner will tip it into scrolling unless the padding gives way. It did, once:
  // +29px at 720. Both sizes are pinned because the phone case passed while the short
  // laptop broke, and a test that only checked one would have shipped it.
  for (const vp of [
    { name: "phone", width: 390, height: 844 },
    { name: "short laptop", width: 1280, height: 720 },
  ]) {
    test(`the banner does not cost the doorway its single screen (${vp.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/?error=invalid-link");
      await expect(page.getByText(/didn.t work/i)).toBeVisible();

      const { content, viewport } = await page.evaluate(() => ({
        content: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
      }));
      expect(content).toBeLessThanOrEqual(viewport + 1);
    });
  }

  test("does not show the banner without the error param", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/didn.t work/i)).toHaveCount(0);
  });

  test("sends the link and shows confirmation (email-only, no groupId)", async ({
    page,
  }) => {
    // Binding constraint: the form posts {email} only - no groupId (the /join
    // flow that used to supply one is gone).
    await page.route("**/api/auth/email-link", async (route) => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      expect(request.postDataJSON()).toEqual({ email: "test@example.com" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "If this email is registered, a login link has been sent.",
        }),
      });
    });

    await page.goto("/");
    await page.getByLabel(/Your email/i).fill("test@example.com");
    await page.getByRole("button", { name: /Email me my link/i }).click();

    await expect(page.getByText(/Check your email/i)).toBeVisible();
  });
});

test.describe("Admin Portal Login", () => {
  // playwright.config.ts sets ADMIN_BREAKGLASS_PASSWORD for the e2e webServer
  // and leaves OIDC env unset, so throughout this block: break-glass is
  // configured (its password field renders unwrapped, since with no OIDC it
  // is the only/fallback method) and the OIDC button must never appear.

  test("renders the Admin Portal heading with the break-glass form and no dead SSO button", async ({
    page,
  }) => {
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: /Admin Portal/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Admin Password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Login$/i })).toBeVisible();
    // OIDC isn't configured in this env - the SSO link must be absent, not
    // just hidden, so a break-glass-only deployment never ships a dead button.
    await expect(
      page.getByRole("link", { name: /Sign in with NorthAuth/i })
    ).toHaveCount(0);
  });

  test("has a back to home link", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /Back to Home/i })).toBeVisible();
  });

  test("submits break-glass password to /api/admin/auth and lands on /admin/dashboard on success", async ({
    page,
  }) => {
    await page.route("**/api/admin/auth", async (route) => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      // Binding constraint: body is {password} only, no groupId.
      expect(request.postDataJSON()).toEqual({ password: "correct-horse-battery" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    // The dashboard independently verifies the session via /api/auth/session
    // on mount (see app/admin/dashboard/page.tsx), so that also needs to
    // report an authenticated admin or it bounces straight back to /admin.
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: true, isAdmin: true }),
      });
    });

    // The dashboard also fetches every group the admin can administer
    // (P4-B4) - an empty list is enough here since this test only checks
    // where the login redirects to, not the dashboard content.
    await page.route("**/api/groups", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto("/admin");
    await page.getByLabel(/Admin Password/i).fill("correct-horse-battery");
    await page.getByRole("button", { name: /^Login$/i }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("shows the server's error message inline on failed break-glass login", async ({
    page,
  }) => {
    await page.route("**/api/admin/auth", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.goto("/admin");
    await page.getByLabel(/Admin Password/i).fill("wrong-password");
    await page.getByRole("button", { name: /^Login$/i }).click();

    await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("maps a known ?error= code to its plain message", async ({ page }) => {
    await page.goto("/admin?error=not_authorized");
    await expect(
      page.getByText(/not allowed to administer this app/i)
    ).toBeVisible();
  });

  test("does not reflect an unknown ?error= value", async ({ page }) => {
    await page.goto("/admin?error=totally_bogus_value_xyz");
    await expect(page.getByText(/totally_bogus_value_xyz/i)).toHaveCount(0);
  });

  test("does not 500 or show an error on prototype-chain ?error= payloads", async ({
    page,
  }) => {
    // A plain-object lookup keyed by these inherited names resolves up the
    // prototype chain to a truthy value (Object.prototype, the constructor
    // fn, etc.), which React then tries to render as a child and throws
    // "Objects are not valid as a React child" -> HTTP 500. Any unauthed
    // visitor can trigger it; ?error= is attacker-controlled. The Map lookup
    // returns undefined for all of them, honoring the "unknown -> no error"
    // contract.
    for (const payload of ["__proto__", "constructor", "hasOwnProperty"]) {
      const response = await page.goto(`/admin?error=${payload}`);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: /Admin Portal/i })
      ).toBeVisible();
      // No error banner, and the raw payload is never reflected either.
      await expect(page.getByText(new RegExp(payload, "i"))).toHaveCount(0);
    }
  });
});

test.describe("Error Handling", () => {
  test("wishlist redirects when not logged in", async ({ page }) => {
    await page.goto("/wishlist");
    // The page checks /api/auth/session; with no session cookie it redirects home.
    await expect(page).toHaveURL("/");
  });
});

test.describe("Full Flow (with mocked API)", () => {
  test("admin login -> view dashboard", async ({ page }) => {
    // Group creation is admin-only via the dashboard now (P4-B4, no public
    // /create page) - already covered by the POST /api/groups/create tests
    // in __tests__/api/routes.test.ts. This flow starts at admin login.
    await page.route("**/api/admin/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          group: {
            id: "flow-test-group",
            name: "Flow Test Family",
            inviteCode: "FLW123",
          },
        }),
      });
    });

    // The dashboard independently verifies the session via /api/auth/session
    // on mount, so that also needs to report an authenticated admin. P4-B4:
    // the super-admin owns every group, so the session no longer carries a
    // single adminGroupId/adminGroupName/adminInviteCode.
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          isAdmin: true,
          adminEmail: "admin@example.com",
          adminLoginMethod: "breakglass",
        }),
      });
    });

    // The dashboard fetches every group the admin can administer (P4-B4) and
    // defaults its picker to the first one - a single-group list is enough
    // to drive the rest of this flow without needing to change the picker.
    await page.route("**/api/groups", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "flow-test-group", name: "Flow Test Family", year: 2026 },
        ]),
      });
    });

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /Admin Portal/i })
    ).toBeVisible();
    await page.getByLabel(/Admin Password/i).fill("securepass123");
    await page.getByRole("button", { name: /Login/i }).click();

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /Admin Dashboard/i })
    ).toBeVisible();

    // The group picker rendered with the fetched group selected, and the
    // dashboard proceeded past the empty state into the real admin UI.
    await expect(
      page.getByRole("combobox", { name: /Group/i })
    ).toHaveValue("flow-test-group");
    await expect(
      page.getByRole("heading", { name: /Add Person/i })
    ).toBeVisible();
  });
});
