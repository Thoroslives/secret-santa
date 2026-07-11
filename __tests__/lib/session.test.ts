import { cookieSecure, SessionData } from "@/lib/session";

test.each([
  [{ NODE_ENV: "production", COOKIE_SECURE: "false" }, false],
  [{ COOKIE_SECURE: "true" }, true],
  [{ NODE_ENV: "production" }, true],
  [{ NODE_ENV: "development" }, false],
])("cookieSecure(%o) => %s", (env, expected) =>
  expect(cookieSecure(env as NodeJS.ProcessEnv)).toBe(expected));

// P4: SessionData collapsed from per-group admin (adminGroupId/adminGroupName/
// adminInviteCode) to a single super-admin (adminEmail/adminLoginMethod, plus
// transient OIDC fields). These are compile-time checks - ts-jest type-checks
// this file, so a regression on either side (a removed field coming back, or
// a new field never being added) fails the suite even though there is no
// runtime behavior in a plain interface to assert against.
test("SessionData has the P4 super-admin shape (compile-time)", () => {
  const admin: SessionData = {
    isAdmin: true,
    adminEmail: "admin@example.com",
    adminLoginMethod: "oidc",
    oidcVerifier: "verifier",
    oidcState: "state",
  };
  expect(admin.isAdmin).toBe(true);

  const breakglass: SessionData = { isAdmin: true, adminLoginMethod: "breakglass" };
  expect(breakglass.adminLoginMethod).toBe("breakglass");

  // @ts-expect-error adminGroupId was removed in P4 - per-group admin is gone.
  const stale: SessionData = { adminGroupId: "group-1" };
  expect(stale).toBeDefined();
});
