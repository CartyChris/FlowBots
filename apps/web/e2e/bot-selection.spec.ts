import { expect, type Page, test } from "@playwright/test";

test("non-first bot selection survives repeated background bot-list polls", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `sticky-selection-${stamp}@rakazo.test`, "password12", "Sticky Selection");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await createBot(page, "Randy", "Research specialist");
  await createBot(page, "Susie", "Builder specialist");

  const sidebar = page.locator("aside").first();
  await sidebar.getByRole("button", { name: /Randy/ }).click();
  await expect(page.getByPlaceholder("Message Randy")).toBeVisible();
  const randyUrl = page.url();
  expect(randyUrl).toMatch(/\/app\//);

  await page.waitForTimeout(8_500);
  await expect(page).toHaveURL(randyUrl);
  await expect(page.getByPlaceholder("Message Randy")).toBeVisible();

  await sidebar.getByRole("button", { name: /Susie/ }).click();
  await expect(page.getByPlaceholder("Message Susie")).toBeVisible();
  const susieUrl = page.url();
  await page.waitForTimeout(4_500);
  await expect(page).toHaveURL(susieUrl);
  await expect(page.getByPlaceholder("Message Susie")).toBeVisible();
});

async function createBot(page: Page, name: string, title: string) {
  await page.getByTitle("New bot").click();
  await page.getByPlaceholder("Name this bot").fill(name);
  await page.getByPlaceholder("Describe what this bot does").fill(title);
  await page.getByPlaceholder("What this bot is for").fill(`${name} handles ${title.toLowerCase()}.`);
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
