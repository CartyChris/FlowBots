import { expect, type Page, test } from "@playwright/test";

const harnessOwner = {
  email: `harness-owner-${Date.now()}@rakazo.test`,
  password: "password12",
  name: "Harness Owner",
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signup(page, harnessOwner.email, harnessOwner.password, harnessOwner.name);
  } finally {
    await context.close();
  }
});

test("two users are isolated and a bot completes durable work", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  const stamp = Date.now();
  await signup(pageA, `ada-${stamp}@rakazo.test`, "password12", "Ada");
  await completeOnboarding(pageA, ["A bit of everything", "Clear and tight"]);
  await expect(pageA.getByText("Chief").first()).toBeVisible();

  await signup(pageB, `bob-${stamp}@rakazo.test`, "password12", "Bob");
  await completeOnboarding(pageB, ["Coding & repos", "Clear and tight"]);
  await expect(pageB.getByText("Chief").first()).toBeVisible();
  await expect(pageB.getByText("Ada")).toHaveCount(0);

  const composer = pageA.getByPlaceholder(/Message/);
  await composer.fill("write a file in your home called notes/result.txt that says isolation-ok");
  await pageA.keyboard.press("Enter");
  await expect(
    pageA.getByText(/writing that into my home|isolation-ok|handled/i).first(),
  ).toBeVisible({
    timeout: 30_000,
  });

  await pageA.reload();
  await expect(pageA.getByText(/isolation-ok|writing that into my home/i).first()).toBeVisible();

  await a.close();
  await b.close();
});

test("takeover, routine, plugins, and export are reachable", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `flow-${stamp}@rakazo.test`, "password12", "Flow");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  const composer = page.getByPlaceholder(/Message/);
  await composer.fill("install the gsc cli and sign in");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/sign in to continue|protected input/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTitle("Agent computer").click();
  await page.getByRole("button", { name: "Take control" }).click();
  await expect(page.getByRole("button", { name: "Close computer" })).toBeVisible();
  await page.getByRole("button", { name: "Release" }).last().click();
  await expect(page.getByRole("button", { name: "Close computer" })).toBeHidden();
  await expect(page.getByText(/signed in|session stays/i).first()).toBeVisible({ timeout: 30_000 });

  await page.getByText("+ New routine").click();
  await page.locator("label:has-text('Name') input").fill("Monday briefing");
  await page
    .locator("label:has-text('Instruction') textarea")
    .fill("write a file in your home called notes/result.txt that says routine-ok");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Monday briefing")).toBeVisible();

  await page.getByText("Plugins").click();
  await expect(page.getByPlaceholder("Search apps")).toBeVisible();
  await page.getByRole("button", { name: "Close plugins" }).click();

  await page.getByText("Chief").first().click();
  await closeLookStudioIfOpen(page);
  const gear = page.locator("button:has-text('⚙')");
  if (!(await gear.isVisible().catch(() => false))) {
    await page.getByTitle("Agent computer").click();
  }
  await gear.click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/chief-export\.json/i);
  await expect(page.getByRole("button", { name: "Delete bot" })).toBeVisible();
});

test("Harness Center lists coding agents and probes a custom argv-based CLI", async ({ page }) => {
  await signin(page, harnessOwner.email, harnessOwner.password);
  await completeOnboarding(page, ["Coding & repos", "Clear and tight"]);

  await page.getByRole("button", { name: "Harnesses" }).click();
  await expect(page.getByRole("heading", { name: "Harness Center" })).toBeVisible();
  await expect(page.getByText("Claude Code", { exact: true })).toBeVisible();
  await expect(page.getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByText("Kimi Code", { exact: true })).toBeVisible();
  await expect(page.getByText("OpenCode", { exact: true })).toBeVisible();
  await expect(page.getByText("Gemini CLI", { exact: true })).toBeVisible();
  await expect(page.getByText("Prime Agent", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Executable (for example, gemini)").fill("node");
  await page.getByPlaceholder("One argument per line").fill("--version");
  await page.getByRole("button", { name: "Test custom harness" }).click();
  await expect(page.getByText(/Custom harness available/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Close harness center" }).click();
  await expect(page.getByRole("heading", { name: "Harness Center" })).toBeHidden();
});

test("roles, faces, composer actions, MCP, and reactions work in the shell", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `social-${stamp}@rakazo.test`, "password12", "Social");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByText("Chief").first().click();
  await closeLookStudioIfOpen(page);
  const gear = page.locator("button:has-text('⚙')");
  if (!(await gear.isVisible().catch(() => false))) {
    await page.getByTitle("Agent computer").click();
  }
  await gear.click();
  await page.getByLabel("Bot role").selectOption("Developer");
  await page.getByRole("button", { name: "Use Cat face" }).click();
  await page.getByRole("button", { name: "Save bot settings" }).click();
  await expect(page.getByLabel("Bot role")).toHaveValue("Developer");
  await expect(page.getByRole("button", { name: "Use Cat face" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const composer = page.getByPlaceholder(/Message/);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("menu", { name: "Add context" })).toBeVisible();
  await page.getByRole("menuitem", { name: "MCP servers" }).click();
  await expect(page.getByRole("heading", { name: "MCP servers", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close MCP servers", exact: true }).click();

  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Ask a teammate" }).click();
  await expect(composer).toHaveValue(/Ask a teammate bot to/);

  await composer.fill("Reply with hello in one short sentence.");
  await page.keyboard.press("Enter");
  const fire = page.getByRole("button", { name: "React 🔥" }).last();
  await expect(fire).toBeVisible({ timeout: 30_000 });
  await fire.click();
  await expect(fire).toHaveAttribute("aria-pressed", "true");
});

test("sign-in, spawn, and stop work in the shell", async ({ page }) => {
  const stamp = Date.now();
  const email = `shell-${stamp}@rakazo.test`;
  await signup(page, email, "password12", "Shell");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  const composer = page.getByPlaceholder(/Message/);
  await composer.fill("spawn a bot named Scout to research venues");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary").getByRole("button", { name: /Scout/ })).toBeVisible({
    timeout: 30_000,
  });

  await page
    .getByRole("complementary")
    .getByRole("button", { name: /^Chief/ })
    .click();
  await composer.fill("keep working until I stop you");
  await page.keyboard.press("Enter");
  await expect(page.getByText("still working").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });

  await page.context().clearCookies();
  await signin(page, email, "password12");
  await page.waitForURL(/\/app/, { timeout: 20_000 });
  await expect(
    page.getByRole("complementary").getByRole("button", { name: /^Chief/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary").getByRole("button", { name: /Scout/ }),
  ).toBeVisible();
});

async function closeLookStudioIfOpen(page: Page) {
  const close = page.getByRole("button", { name: "Close Look Studio", exact: true });
  await close.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await close.isVisible().catch(() => false)) await close.click();
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

async function signin(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Your email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Continue with email" }).click();
}
