import { expect, type Page, test } from "@playwright/test";

test("virtual office and workbench are reachable from the shell", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `creative-runtime-${stamp}@rakazo.test`, "password12", "Creative Runtime");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByRole("button", { name: "Virtual Office" }).click();
  await expect(page.getByRole("heading", { name: "Virtual Office" })).toBeVisible();
  await expect(page.getByText("Focus Desks", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Artifact Studio", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close virtual office" }).click();

  await page.getByRole("button", { name: "Workbench" }).click();
  await expect(page.getByRole("heading", { name: "Bot Workbench" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sandbox Lab" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Artifact Studio" })).toBeVisible();
});

test("plugins can register declarative GitHub extensions", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `github-extension-${stamp}@rakazo.test`, "password12", "Extension Runtime");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByText("Plugins", { exact: true }).click();
  await page.getByRole("tab", { name: "GitHub Extensions" }).click();
  await expect(
    page.getByRole("heading", { name: "GitHub Extensions", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("GitHub repository URL")).toBeVisible();
  await expect(page.getByLabel("Extension scope")).toBeVisible();
  await expect(page.getByLabel("Extension instructions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Register extension" })).toBeVisible();
});

async function completeOnboarding(page: Page, answers: string[]) {
  await page.waitForURL(/\/(onboarding|app)/, { timeout: 20_000 });
  const heading = page.getByRole("heading", { name: /Connect a model|Create your first bot/ });
  const chief = page.getByText("Chief").first();
  await heading.or(chief).waitFor({ timeout: 20_000 });
  if ((await chief.isVisible().catch(() => false)) && page.url().includes("/app")) return;
  if (
    await page
      .getByRole("heading", { name: "Connect a model" })
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole("button", { name: "Skip for now" }).click();
  }
  if (
    await page
      .getByRole("heading", { name: "Create your first bot" })
      .isVisible()
      .catch(() => false)
  ) {
    await page.locator("label:has-text('Name') input").fill("Chief");
    await page.getByRole("button", { name: "Continue" }).click();
    for (const answer of answers) await page.getByText(answer, { exact: true }).click();
    await page.getByRole("button", { name: "Open Rakazo" }).click();
  }
  await page.waitForURL(/\/app/);
  await expect(page.getByText("Chief").first()).toBeVisible();
}

async function signup(page: Page, email: string, password: string, name: string) {
  await page.goto("/sign-up");
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByPlaceholder("Your email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}
