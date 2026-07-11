import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Secret Santa/);
  });

  test('has a "Join Existing Group" link', async ({ page }) => {
    await page.goto("/");
    const joinLink = page.getByRole("link", { name: /Join Existing Group/i });
    await expect(joinLink).toBeVisible();
  });

  test("has a Participant Login link", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /Participant Login/i }).first()
    ).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");

    // Click Join Existing Group link
    await page
      .getByRole("link", { name: /Join Existing Group/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/join/);
  });

  test('has an FAQ section', async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Frequently Asked Questions/i })
    ).toBeVisible();
  });

  test("has footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toBeVisible();
  });
});

// Note: the public "Create Group Flow" describe block that used to live here
// was removed with app/create/page.tsx (P4 followups, loose end 2b) - group
// creation is admin-only via the dashboard now (B4), already covered by the
// POST /api/groups/create tests in __tests__/api/routes.test.ts and by the
// "Full Flow" admin-login-to-dashboard test below.

test.describe("Join Group Flow", () => {
  test("shows join group form", async ({ page }) => {
    await page.goto("/join");
    await expect(
      page.getByRole("heading", { name: /Join a Secret Santa Group/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Group Invite Code/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Continue/i })
    ).toBeVisible();
  });

  test("handles 6-character invite code input", async ({ page }) => {
    await page.goto("/join");
    const codeInput = page.getByLabel(/Group Invite Code/i);
    await codeInput.fill("ABCDEF");
    await expect(codeInput).toHaveValue("ABCDEF");
  });

  test("converts invite code to uppercase", async ({ page }) => {
    await page.goto("/join");
    const codeInput = page.getByLabel(/Group Invite Code/i);
    await codeInput.fill("abcdef");
    await expect(codeInput).toHaveValue("ABCDEF");
  });

  test("shows error for invalid invite code", async ({ page }) => {
    await page.goto("/join");

    // Mock the API to return an error
    await page.route("**/api/groups/verify", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid invite code" }),
      });
    });

    await page.getByLabel(/Group Invite Code/i).fill("XXXXXX");
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/Invalid invite code/i)).toBeVisible();
  });

  test("shows group info after valid code", async ({ page }) => {
    await page.goto("/join");

    // Mock the API to return group info
    await page.route("**/api/groups/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          group: { id: "test-id", name: "Test Family", year: 2026 },
        }),
      });
    });

    await page.getByLabel(/Group Invite Code/i).fill("ABC123");
    await page.getByRole("button", { name: /Continue/i }).click();

    await expect(page.getByText(/Group Found!/i)).toBeVisible();
    await expect(page.getByText("Test Family")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Admin Portal/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Participant Login/i })
    ).toBeVisible();
  });

  test("continue button is disabled when code is incomplete", async ({
    page,
  }) => {
    await page.goto("/join");
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    // Button should be disabled when code is less than 6 chars
    await expect(continueBtn).toBeDisabled();
    await page.getByLabel(/Group Invite Code/i).fill("ABC");
    await expect(continueBtn).toBeDisabled();
  });

  test("has back to home link", async ({ page }) => {
    await page.goto("/join");
    await expect(page.getByRole("link", { name: /Back to Home/i })).toBeVisible();
  });
});

test.describe("Login Page (participant, email link)", () => {
  test("redirects to home if no groupId in sessionStorage", async ({
    page,
  }) => {
    await page.goto("/login");
    // Should redirect to home since no groupId is set
    await expect(page).toHaveURL("/");
  });

  test("shows email login form when groupId is set", async ({ page }) => {
    // Set sessionStorage before navigating
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /Welcome!/i })
    ).toBeVisible();
    await expect(page.getByText("Test Family")).toBeVisible();
    await expect(page.getByLabel(/Email Address/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Send Login Link/i })
    ).toBeVisible();
  });

  test("sends login link and shows confirmation", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/login");

    await page.route("**/api/auth/email-link", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.getByLabel(/Email Address/i).fill("test@example.com");
    await page.getByRole("button", { name: /Send Login Link/i }).click();

    await expect(page.getByText(/Check your email!/i)).toBeVisible();
  });

  test("has back to home link", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /Back to Home/i })).toBeVisible();
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
  test("join form shows error with invalid code", async ({ page }) => {
    await page.goto("/join");

    await page.route("**/api/groups/verify", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid invite code" }),
      });
    });

    await page.getByLabel(/Group Invite Code/i).fill("ZZZZZZ");
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/Invalid invite code/i)).toBeVisible();
  });

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

  test("join group -> participant login flow", async ({ page }) => {
    // Step 1: Join a group
    await page.goto("/join");

    await page.route("**/api/groups/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          group: { id: "join-test-group", name: "Join Test Family", year: 2026 },
        }),
      });
    });

    await page.getByLabel(/Group Invite Code/i).fill("JON123");
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/Group Found!/i)).toBeVisible();

    // Step 2: Choose participant login
    await page.getByRole("button", { name: /Participant Login/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // Login page should show the group name
    await expect(page.getByText("Join Test Family")).toBeVisible();
  });
});
