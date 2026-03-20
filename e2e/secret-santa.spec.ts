import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Secret Santa/);
  });

  test('has "Create New Group" and "Join Existing Group" links', async ({
    page,
  }) => {
    await page.goto("/");
    const createLink = page.getByRole("link", { name: /Create New Group/i });
    const joinLink = page.getByRole("link", { name: /Join Existing Group/i });
    await expect(createLink).toBeVisible();
    await expect(joinLink).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");

    // Click Create New Group link
    await page.getByRole("link", { name: /Create New Group/i }).first().click();
    await expect(page).toHaveURL(/\/create/);

    // Go back and click Join Existing Group
    await page.goto("/");
    await page
      .getByRole("link", { name: /Join Existing Group/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/join/);
  });

  test('has "How It Works" section', async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /How It Works/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Create Your Group/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Share & Create Wishlists/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Generate Assignments/i })
    ).toBeVisible();
  });

  test("has features section", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /Why Choose Our Secret Santa Generator/i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Automatic Assignment/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Wishlist Management/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Private & Secure/i })
    ).toBeVisible();
  });

  test("has structured data (JSON-LD)", async ({ page }) => {
    await page.goto("/");
    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd).toBeAttached();
    const content = await jsonLd.textContent();
    expect(content).toBeTruthy();
    const parsed = JSON.parse(content!);
    expect(parsed["@type"]).toBe("WebApplication");
    expect(parsed.name).toBe("Secret Santa Generator");
  });

  test("has CTA section with action links", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /Ready to Create Your Secret Santa Magic/i,
      })
    ).toBeVisible();
    // CTA buttons link to /create and /join
    await expect(
      page.getByRole("link", { name: /Start New Group/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Join Existing Group/i }).last()
    ).toBeVisible();
  });

  test("has footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toBeVisible();
    await expect(
      page.getByText(/Secret Santa Generator/i).last()
    ).toBeVisible();
  });
});

test.describe("Create Group Flow", () => {
  test("shows create group form", async ({ page }) => {
    await page.goto("/create");
    await expect(
      page.getByRole("heading", { name: /Create Your Secret Santa Group/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Group Name/i)).toBeVisible();
    await expect(page.getByLabel(/^Year$/i)).toBeVisible();
    await expect(page.getByLabel(/^Admin Password$/i)).toBeVisible();
    await expect(page.getByLabel(/Confirm Password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Create Group/i })
    ).toBeVisible();
  });

  test("shows validation error when passwords do not match", async ({
    page,
  }) => {
    await page.goto("/create");
    await page.getByLabel(/Group Name/i).fill("Test Family");
    await page.getByLabel(/^Admin Password$/i).fill("password123");
    await page.getByLabel(/Confirm Password/i).fill("differentpassword");
    await page.getByRole("button", { name: /Create Group/i }).click();
    await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
  });

  test("shows validation error when password is too short", async ({
    page,
  }) => {
    await page.goto("/create");
    await page.getByLabel(/Group Name/i).fill("Test Family");
    await page.getByLabel(/^Admin Password$/i).fill("abc");
    await page.getByLabel(/Confirm Password/i).fill("abc");
    await page.getByRole("button", { name: /Create Group/i }).click();
    await expect(
      page.getByText(/Admin password must be at least 6 characters/i)
    ).toBeVisible();
  });

  test("has back to home link", async ({ page }) => {
    await page.goto("/create");
    await expect(page.getByRole("link", { name: /Back to Home/i })).toBeVisible();
  });

  test("fills in form and submits", async ({ page }) => {
    await page.goto("/create");
    await page.getByLabel(/Group Name/i).fill("E2E Test Family");
    await page.getByLabel(/^Year$/i).fill("2026");
    await page.getByLabel(/^Admin Password$/i).fill("testpassword123");
    await page.getByLabel(/Confirm Password/i).fill("testpassword123");

    // Mock the API response so we don't need a real backend
    await page.route("**/api/groups/create", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          group: {
            id: "test-group-id",
            name: "E2E Test Family",
            inviteCode: "ABC123",
          },
        }),
      });
    });

    await page.getByRole("button", { name: /Create Group/i }).click();

    // Should redirect to admin page
    await expect(page).toHaveURL(/\/admin/);
  });
});

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

test.describe("Login Page", () => {
  test("redirects to home if no groupId in sessionStorage", async ({
    page,
  }) => {
    await page.goto("/login");
    // Should redirect to home since no groupId is set
    await expect(page).toHaveURL("/");
  });

  test("shows login form when groupId is set", async ({ page }) => {
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
  });

  test("has code and email login method toggle", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/login");

    // Both toggle buttons should be visible
    await expect(page.getByRole("button", { name: /Login Code/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Email Link/i })).toBeVisible();
  });

  test("toggles between login methods", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/login");

    // Code login should be shown by default
    await expect(page.getByLabel(/Login Code/i)).toBeVisible();

    // Switch to email
    await page.getByRole("button", { name: /Email Link/i }).click();
    await expect(page.getByLabel(/Email Address/i)).toBeVisible();

    // Switch back to code
    await page.getByRole("button", { name: /Login Code/i }).click();
    await expect(page.getByLabel(/Login Code/i)).toBeVisible();
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

test.describe("Admin Dashboard", () => {
  test("redirects to home if no groupId in sessionStorage", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL("/");
  });

  test("shows admin login form when groupId is set", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: /Admin Portal/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Admin Password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Login/i })
    ).toBeVisible();
  });

  test("shows group name on admin page", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/admin");
    await expect(page.getByText("Test Family")).toBeVisible();
  });

  test("has back to home link", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("groupId", "test-group-id");
      sessionStorage.setItem("groupName", "Test Family");
    });
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /Back to Home/i })).toBeVisible();
  });
});

test.describe("Error Handling", () => {
  test("create form shows error when group name is empty and password is valid", async ({
    page,
  }) => {
    await page.goto("/create");
    // Leave group name empty, fill password fields
    await page.getByLabel(/^Admin Password$/i).fill("password123");
    await page.getByLabel(/Confirm Password/i).fill("password123");
    // The HTML required attribute should prevent submission,
    // but we can also check the field is required
    const groupNameInput = page.getByLabel(/Group Name/i);
    await expect(groupNameInput).toHaveAttribute("required", "");
  });

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

  test("wishlist redirects to login when not logged in", async ({ page }) => {
    await page.goto("/wishlist");
    // Should redirect to /login, then to / since no groupId
    await expect(page).toHaveURL("/");
  });

  test("create form handles API errors gracefully", async ({ page }) => {
    await page.goto("/create");
    await page.getByLabel(/Group Name/i).fill("Test Group");
    await page.getByLabel(/^Admin Password$/i).fill("password123");
    await page.getByLabel(/Confirm Password/i).fill("password123");

    await page.route("**/api/groups/create", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.getByRole("button", { name: /Create Group/i }).click();
    await expect(page.getByText(/Internal server error/i)).toBeVisible();
  });
});

test.describe("Full Flow (with mocked API)", () => {
  test("create group -> admin login -> view dashboard", async ({ page }) => {
    // Step 1: Create a group
    await page.goto("/create");

    await page.route("**/api/groups/create", async (route) => {
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

    await page.getByLabel(/Group Name/i).fill("Flow Test Family");
    await page.getByLabel(/^Year$/i).fill("2026");
    await page.getByLabel(/^Admin Password$/i).fill("securepass123");
    await page.getByLabel(/Confirm Password/i).fill("securepass123");
    await page.getByRole("button", { name: /Create Group/i }).click();

    // Should redirect to admin login
    await expect(page).toHaveURL(/\/admin/);

    // Step 2: Admin login
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

    await expect(
      page.getByRole("heading", { name: /Admin Portal/i })
    ).toBeVisible();
    await page.getByLabel(/Admin Password/i).fill("securepass123");
    await page.getByRole("button", { name: /Login/i }).click();

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/);
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

test.describe("Responsive Design", () => {
  test("mobile viewport renders correctly", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }, // iPhone X
    });
    const page = await context.newPage();
    await page.goto("/");

    // Hero section should be visible
    await expect(
      page.getByRole("heading", { name: /Free Secret Santa Generator/i })
    ).toBeVisible();

    // Create and Join links should be visible
    await expect(
      page.getByRole("link", { name: /Create New Group/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Join Existing Group/i }).first()
    ).toBeVisible();

    // Footer should be visible
    await expect(page.locator("footer")).toBeVisible();

    await context.close();
  });

  test("desktop viewport renders correctly", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    await page.goto("/");

    // Hero section should be visible
    await expect(
      page.getByRole("heading", { name: /Free Secret Santa Generator/i })
    ).toBeVisible();

    // Features section should be visible
    await expect(
      page.getByRole("heading", {
        name: /Why Choose Our Secret Santa Generator/i,
      })
    ).toBeVisible();

    // How It Works section should be visible
    await expect(
      page.getByRole("heading", { name: /How It Works/i })
    ).toBeVisible();

    await context.close();
  });

  test("create form works on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.goto("/create");

    await expect(
      page.getByRole("heading", { name: /Create Your Secret Santa Group/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Group Name/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Create Group/i })
    ).toBeVisible();

    await context.close();
  });

  test("join form works on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.goto("/join");

    await expect(
      page.getByRole("heading", { name: /Join a Secret Santa Group/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Group Invite Code/i)).toBeVisible();

    await context.close();
  });
});

test.describe("Pricing Section", () => {
  test("shows pricing on home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Simple Pricing/i).first()).toBeVisible();
    await expect(page.getByText(/\$0/).first()).toBeVisible();
    await expect(page.getByText(/\$10/).first()).toBeVisible();
  });
});
