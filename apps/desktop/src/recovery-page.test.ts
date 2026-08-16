import { describe, expect, it } from "vitest";
import { diagnosticsText, recoveryPageHtml } from "./recovery-page.js";

const baseModel = {
  currentUrl: "http://127.0.0.1:5173",
  error: "ERR_CONNECTION_REFUSED (-102)",
  recentUrls: ["https://rakazo.example"],
  appVersion: "0.1.0",
  platform: "darwin arm64",
  webStatus: "offline" as const,
  apiStatus: "offline" as const,
};

describe("desktop Connection Center", () => {
  it("renders recovery actions, local setup help, recents, and health state", () => {
    const html = recoveryPageHtml(baseModel);

    for (const label of [
      "Connection Center",
      "Retry",
      "Save & Connect",
      "Reset to Local",
      "Copy Diagnostics",
      "https://rakazo.example",
      "Web origin",
      "Rakazo API",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("docker compose -f infra/compose/docker-compose.yml up postgres -d");
    expect(html).toContain("pnpm dev");
    expect(html).toContain("Offline");
  });

  it("escapes every user-controlled value before inserting it into HTML", () => {
    const payload = "<script>alert(1)</script>";
    const html = recoveryPageHtml({
      ...baseModel,
      currentUrl: `https://example.com/?q=${payload}`,
      error: payload,
      recentUrls: [`https://example.com/${payload}`],
    });

    expect(html).not.toContain(payload);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("limits copied diagnostics to non-secret connection state", () => {
    const report = diagnosticsText(baseModel);

    expect(report).toContain("Rakazo desktop diagnostics");
    expect(report).toContain("App: 0.1.0");
    expect(report).toContain("Platform: darwin arm64");
    expect(report).toContain("Target: http://127.0.0.1:5173");
    expect(report).toContain("Navigation: ERR_CONNECTION_REFUSED (-102)");
    expect(report).toContain("Web origin: offline");
    expect(report).toContain("Rakazo API: offline");

    for (const forbidden of [
      "process.env",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "cookie",
      "authorization",
    ]) {
      expect(report.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
