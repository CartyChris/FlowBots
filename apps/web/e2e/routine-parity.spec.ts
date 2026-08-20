import { expect, type Page, test } from "@playwright/test";

test("routine editing updates in place and deletion persists", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `routine-parity-${stamp}@rakazo.test`, "password12", "Routine Parity");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByTitle("Agent computer").click();
  await page.getByText("+ New routine").click();
  await page.locator("label:has-text('Name') input").fill("Tokyo check-in");
  await page.locator("label:has-text('Instruction') textarea").fill("Send the original update");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const original = page.getByRole("button", { name: /Tokyo check-in/ });
  await expect(original).toHaveCount(1);
  await original.click();
  await page.locator("label:has-text('Name') input").fill("Weekday check-in");
  await page.locator("label:has-text('Instruction') textarea").fill("Send the revised update");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const updated = page.getByRole("button", { name: /Weekday check-in/ });
  await expect(updated).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Tokyo check-in/ })).toHaveCount(0);

  await updated.click();
  await page.getByRole("button", { name: "Delete routine" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete Weekday check-in?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(updated).toHaveCount(0);

  await page.reload();
  await page.getByTitle("Agent computer").click();
  await expect(page.getByRole("button", { name: /Weekday check-in/ })).toHaveCount(0);
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
