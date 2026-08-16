import { describe, expect, it } from "vitest";
import { type AppEnv, loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://rakazo:rakazo@127.0.0.1:5433/rakazo",
  NODE_ENV: "test",
};

const embeddedEnv: AppEnv = {
  databaseUrl: "postgres://rakazo@127.0.0.1:65432/rakazo",
  realtimeDatabaseUrl: "postgres://rakazo@127.0.0.1:65432/rakazo",
  authSecret: "embedded-auth-secret-at-least-32-characters",
  authUrl: "http://127.0.0.1:43117",
  webOrigin: "http://127.0.0.1:43117",
  apiUrl: "http://127.0.0.1:43117",
  signupsEnabled: "true",
  signupAllowlist: undefined,
  encryptionKey: "embedded-encryption-key-at-least-32-characters",
  dataDir: "/tmp/rakazo-lite",
  sandboxSupervisorUrl: "http://127.0.0.1:7091",
  sandboxSupervisorToken: "embedded-supervisor-token",
  sandboxProvider: "desktop",
  agentRuntime: "pi",
  openRouterKey: undefined,
  e2bApiKey: undefined,
  composioApiKey: undefined,
  defaultProvider: "openrouter",
  defaultModel: "test/model",
  wakeupDriver: "memory",
  port: 43117,
};

describe("loadEnv", () => {
  it("defaults the product path to Pi, Docker, and Graphile Worker", () => {
    const env = loadEnv(base);
    expect(env.agentRuntime).toBe("pi");
    expect(env.sandboxProvider).toBe("docker");
    expect(env.wakeupDriver).toBe("graphile");
  });

  it("keeps explicit emulator settings for pnpm test", () => {
    const env = loadEnv({
      ...base,
      AGENT_RUNTIME: "scripted",
      SANDBOX_PROVIDER: "fake",
      WAKEUP_DRIVER: "memory",
    });
    expect(env.agentRuntime).toBe("scripted");
    expect(env.sandboxProvider).toBe("fake");
    expect(env.wakeupDriver).toBe("memory");
  });

  it("accepts a fully explicit embedded environment without ambient server variables", () => {
    const env = loadEnv({}, embeddedEnv);
    expect(env).toEqual(embeddedEnv);
    expect(env.sandboxProvider).toBe("desktop");
    expect(env.wakeupDriver).toBe("memory");
  });

  it("throws when production omits secrets", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: base.DATABASE_URL,
        NODE_ENV: "production",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("throws when production uses placeholder secrets", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: base.DATABASE_URL,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "dev-secret-change-me-please-32chars",
        ENCRYPTION_KEY: "real-encryption-key-value",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("loads real secrets in production", () => {
    const env = loadEnv({
      DATABASE_URL: base.DATABASE_URL,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-auth-secret-with-enough-length",
      ENCRYPTION_KEY: "prod-encryption-key-with-enough-length",
    });
    expect(env.authSecret).toBe("prod-auth-secret-with-enough-length");
    expect(env.encryptionKey).toBe("prod-encryption-key-with-enough-length");
  });
});
