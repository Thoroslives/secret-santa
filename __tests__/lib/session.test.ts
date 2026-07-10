import { cookieSecure } from "@/lib/session";

test.each([
  [{ NODE_ENV: "production", COOKIE_SECURE: "false" }, false],
  [{ COOKIE_SECURE: "true" }, true],
  [{ NODE_ENV: "production" }, true],
  [{ NODE_ENV: "development" }, false],
])("cookieSecure(%o) => %s", (env, expected) =>
  expect(cookieSecure(env as NodeJS.ProcessEnv)).toBe(expected));
