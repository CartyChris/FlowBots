import { expect, type Page, test } from "@playwright/test";

test("Connections exposes All and Connected views", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `connections-parity-${stamp}@rakazo.test`, "password12", "Connections Parity");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByText("Plugins", { exact: true }).click();
  await expect(page.getByRole("tab", { name: "All", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Connected", exact: true })).toBeVisible();
});

test("model management stays reachable and accepts typed custom provider/model IDs", async ({
  page,
}) => {
  const stamp = Date.now();
  const name = "Model Parity";
  await signup(page, `models-parity-${stamp}@rakazo.test`, "password12", name);
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  const models = page.getByRole("button", { name: "Models", exact: true });
  await expect(models).toBeVisible({ timeout: 5_000 });
  await models.click();
  await expect(page.getByRole("heading", { name: "Models", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Search providers")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add custom model" })).toBeVisible();
  await expect(page.getByLabel("Custom provider ID")).toBeVisible();
  await expect(page.getByLabel("Custom model ID")).toBeVisible();
  await expect(page.getByLabel("Custom provider label")).toBeVisible();
  await expect(page.getByLabel("Custom provider API key")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add custom model" })).toBeVisible();
  await page.getByRole("button", { name: "Close model settings", exact: true }).click();
});

test("Look Studio exposes fifteen bot types and persists a custom identity", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `looks-parity-${stamp}@rakazo.test`, "password12", "Looks Parity");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByRole("button", { name: "Look Studio", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Look Studio · Chief/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /bot type$/ })).toHaveCount(15);

  const fox = page.getByRole("button", { name: "Use Fox bot type", exact: true });
  await fox.click();
  await page.getByRole("button", { name: /Headphones/ }).click();
  await page.getByRole("button", { name: /Circuit/ }).click();
  await page.getByRole("button", { name: "Strong", exact: true }).click();
  await page.getByRole("button", { name: "Save bot look", exact: true }).click();
  await expect(fox).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Close Look Studio", exact: true }).click();
  await page.getByRole("button", { name: "Look Studio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use Fox bot type", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
    for (const answer of answers) {
      await page.getByText(answer, { exact: true }).click();
    }
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
