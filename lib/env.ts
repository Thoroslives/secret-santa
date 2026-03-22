// Validate required environment variables at startup
// This file should be imported early in the app lifecycle

function validateEnv() {
  const required: Record<string, string> = {
    DATABASE_URL: "PostgreSQL connection string",
    MAGIC_LINK_SECRET: "Secret key for signing magic link tokens (min 32 chars recommended)",
  };

  const recommended: Record<string, string> = {
    SESSION_SECRET: "Secret key for encrypting session cookies (min 32 chars). Falls back to MAGIC_LINK_SECRET if not set.",
    EMAIL_HOST: "SMTP server hostname",
    EMAIL_USER: "SMTP authentication username",
    EMAIL_PASS: "SMTP authentication password",
    NEXTAUTH_URL: "Base URL for magic link emails (e.g. https://your-domain.com)",
  };

  const missing: string[] = [];
  const warnings: string[] = [];

  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`  - ${key}: ${description}`);
    }
  }

  for (const [key, description] of Object.entries(recommended)) {
    if (!process.env[key]) {
      warnings.push(`  - ${key}: ${description}`);
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `\n⚠️  Missing recommended environment variables:\n${warnings.join("\n")}\n`
    );
  }

  if (missing.length > 0) {
    console.error(
      `\n❌ Missing required environment variables:\n${missing.join("\n")}\n`
    );
    throw new Error(
      `Missing required environment variables: ${missing.map((m) => m.split(":")[0].trim().replace("- ", "")).join(", ")}`
    );
  }
}

// Run validation when this module is imported
validateEnv();

export {};
