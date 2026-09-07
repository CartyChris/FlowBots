import { expect, type Page, test } from "@playwright/test";

test("action approvals persist a bot policy and provide an accessible keyboard-dismissible modal", async ({
  page,
}) => {
  const stamp = Date.now();
  await signup(page, `approval-policy-${stamp}@rakazo.test`, "password12", "Approval Policy");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByRole("button", { name: "Action approvals", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Action approvals", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Review level")).toHaveValue("legacy");
  await expect(
    dialog.getByText("No action is waiting for approval.", { exact: true }),
  ).toBeVisible();

  await dialog.getByLabel("Review level").selectOption("review-all");
  await expect(
    dialog.getByText("Ask before every executor-mediated tool action.", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Review level").selectOption("review-risky");
  await page.waitForTimeout(3_250);
  await expect(dialog.getByLabel("Review level")).toHaveValue("review-risky");
  await dialog.getByRole("button", { name: "Save policy", exact: true }).click();
  await expect(dialog.getByText("Action policy saved.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Action approvals", exact: true }).click();
  const reopened = page.getByRole("dialog", { name: "Action approvals", exact: true });
  await expect(reopened.getByLabel("Review level")).toHaveValue("review-risky");
  await reopened.getByRole("button", { name: "Close Action approvals", exact: true }).click();
  await expect(reopened).toHaveCount(0);
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
  )
    await page.getByRole("button", { name: "Skip for now" }).click();
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
}

async function signup(page: Page, email: string, password: string, name: string) {
  await page.goto("/sign-up");
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByPlaceholder("Your email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}
