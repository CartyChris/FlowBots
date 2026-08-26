import { expect, type Page, test } from "@playwright/test";

test("group chat routes @all to distinct bots and persists their authored replies", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `group-chat-${stamp}@rakazo.test`, "password12", "Group Chat");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);
  await createBot(page, "Randy", "Research specialist", "Find current facts, evidence, and sources.");
  await createBot(page, "Susie", "Builder specialist", "Build apps, interfaces, and code.");

  await page.getByRole("button", { name: "New group chat" }).click();
  await expect(page.getByRole("heading", { name: "Create group chat" })).toBeVisible();
  await page.getByLabel("Group name").fill("Launch Room");
  await page.getByRole("checkbox", { name: /Randy/ }).check();
  await page.getByRole("checkbox", { name: /Susie/ }).check();
  await page.getByRole("button", { name: "Create group" }).click();

  await expect(page.getByRole("heading", { name: "Launch Room", exact: true })).toBeVisible();
  const composer = page.getByPlaceholder("Message Launch Room");
  await composer.fill("@all Reply with your own name and one short sentence about what you do.");
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-group-author="Randy"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-group-author="Susie"]').first()).toBeVisible({ timeout: 30_000 });

  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Launch Room", exact: true })).toBeVisible();
  await expect(page.locator('[data-group-author="Randy"]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-group-author="Susie"]').first()).toBeVisible({ timeout: 20_000 });
});

async function createBot(page: Page, name: string, title: string, description: string) {
  await page.getByTitle("New bot").click();
  await page.getByPlaceholder("Name this bot").fill(name);
  await page.getByPlaceholder("Describe what this bot does").fill(title);
  await page.getByPlaceholder("What this bot is for").fill(description);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByPlaceholder(`Message ${name}`)).toBeVisible();
}

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
