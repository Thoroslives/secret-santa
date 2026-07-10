// Validate required environment variables at startup
// This file should be imported early in the app lifecycle

function validateEnv() {
  // DATABASE_URL is set automatically by the Docker image - not validated here.
  const required: Record<string, string> = {
    SESSION_SECRET: "Secret key for encrypting session cookies (min 32 chars)",
    NEXTAUTH_URL: "Base URL for durable person-link emails (e.g. https://your-domain.com)",
  };

  const recommended: Record<string, string> = {
    EMAIL_HOST: "SMTP server hostname",
    EMAIL_USER: "SMTP authentication username",
    EMAIL_PASS: "SMTP authentication password",
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
