import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test("virtual office and workbench are reachable from the shell", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `creative-runtime-${stamp}@rakazo.test`, "password12", "Creative Runtime");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByRole("button", { name: "Virtual Office" }).click();
  await expect(page.getByRole("heading", { name: "Virtual Office" })).toBeVisible();
  await expect(page.getByText("Focus Desks", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Artifact Studio", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const officeAvatar = page.locator(".office-bot-scene").first();
  await expect(officeAvatar).toBeVisible();
  expect(await officeAvatar.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.getByRole("button", { name: "Close virtual office" }).click();

  await page.getByRole("button", { name: "Workbench" }).click();
  await expect(page.getByRole("heading", { name: "Bot Workbench" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sandbox Lab" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Artifact Studio" })).toBeVisible();
});

test("steering studio persists all six agent-evolution axes and Flow membership", async ({
  page,
}) => {
  const stamp = Date.now();
  await signup(page, `steering-studio-${stamp}@rakazo.test`, "password12", "Steering Studio");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByRole("button", { name: "Steering Studio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Steering Studio", exact: true })).toBeVisible();
  await expect(page.getByLabel("Shared Flow")).toHaveValue("connected");
  await page.getByLabel("Initiative").selectOption("proactive");
  await page.getByLabel("Expressiveness").selectOption("animated");
  await page.getByLabel("Challenge").selectOption("skeptical");
  await page.getByLabel("Collaboration").selectOption("team-first");
  await page.getByLabel("Research").selectOption("web-first");
  await page.getByLabel("Depth").selectOption("exhaustive");
  await page.getByLabel("Shared Flow").selectOption("isolated");
  await page.getByRole("button", { name: "Save steering profile" }).click();
  await expect(page.getByText("Steering saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Steering Studio" }).click();

  await page.getByRole("button", { name: "Steering Studio", exact: true }).click();
  await expect(page.getByLabel("Initiative")).toHaveValue("proactive");
  await expect(page.getByLabel("Expressiveness")).toHaveValue("animated");
  await expect(page.getByLabel("Challenge")).toHaveValue("skeptical");
  await expect(page.getByLabel("Collaboration")).toHaveValue("team-first");
  await expect(page.getByLabel("Research")).toHaveValue("web-first");
  await expect(page.getByLabel("Depth")).toHaveValue("exhaustive");
  await expect(page.getByLabel("Shared Flow")).toHaveValue("isolated");
});

test("changed workspace deliverables are downloadable with exact bytes", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `artifact-download-${stamp}@rakazo.test`, "password12", "Artifact Download");
  await completeOnboarding(page, ["Coding & repos", "Clear and tight"]);

  const composer = page.getByPlaceholder(/Message/);
  await composer.fill(
    "write a file in your home called output/result.txt that says artifact-download-ok",
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/artifact-download-ok|writing that into my home|handled/i).first(),
  ).toBeVisible({
    timeout: 30_000,
  });

  // The same durable task and artifact must remain discoverable outside chat.
  await page.getByRole("button", { name: "Virtual Office" }).click();
  await page.getByRole("tab", { name: "Mission Control" }).click();
  await page
    .getByRole("button", { name: /Inspect task.*output\/result\.txt/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Task inspector" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Task inspector", exact: true })
      .getByRole("link", { name: /result\.txt/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close virtual office" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Virtual Office" }).click();
  await page.getByRole("tab", { name: "Mission Control" }).click();
  await expect(
    page.getByRole("button", { name: /Inspect task.*output\/result\.txt/i }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close virtual office" }).click();

  const fileLink = page.getByRole("link", { name: /result\.txt/i });
  await expect(fileLink).toBeVisible({ timeout: 20_000 });
  const downloadPromise = page.waitForEvent("download");
  await fileLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("result.txt");
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  if (!downloadedPath) throw new Error("downloaded artifact has no local path");
  expect(await readFile(downloadedPath, "utf8")).toBe("artifact-download-ok\n");
});

test("Mission cancellation updates the real office worker and survives reload", async ({
  page,
}) => {
  const stamp = Date.now();
  await signup(page, `office-cancel-${stamp}@rakazo.test`, "password12", "Office Cancellation");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  const prompt = "keep working until I stop you";
  await page.getByPlaceholder("Message Chief").fill(prompt);
  await page.keyboard.press("Enter");
  // The scripted runtime emits progress continuously until real cancellation interrupts it.
  await expect(page.getByText(/still working/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Virtual Office", exact: true }).click();
  const office = page.getByRole("dialog", { name: "Virtual Office", exact: true });
  const worker = office.locator("article[data-bot-id]").filter({
    has: page.getByRole("heading", { name: "Chief", exact: true }),
  });
  await expect(worker).toHaveAttribute("data-presence", "thinking", { timeout: 30_000 });
  await expect(worker).toHaveAttribute("data-station", "focus");
  await expect(worker.getByText("Working on the current task", { exact: true })).toBeVisible();
  const botId = await worker.getAttribute("data-bot-id");
  expect(botId).toBeTruthy();

  await worker.getByRole("button", { name: "Inspect Chief task", exact: true }).click();
  const task = office.locator("article[data-task-id]").filter({
    has: page.getByRole("button", { name: `Inspect task ${prompt}`, exact: true }),
  });
  await expect(task.getByText("Chief", { exact: true })).toBeVisible();
  await expect(task.getByText("running", { exact: true })).toBeVisible({ timeout: 30_000 });
  const taskId = await task.getAttribute("data-task-id");
  expect(taskId).toBeTruthy();
  const inspector = office.getByRole("region", { name: "Task inspector", exact: true });
  await expect(inspector.getByText(taskId as string, { exact: true })).toBeVisible();

  await task.getByRole("button", { name: "Stop task tree", exact: true }).click();
  await expect(task.getByText("cancelled", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(task.getByRole("button", { name: "Stop task tree", exact: true })).toHaveCount(0);
  await expect(inspector.getByText("cancelled", { exact: true })).toBeVisible({ timeout: 30_000 });

  await office.getByRole("tab", { name: "Office floor", exact: true }).click();
  await expect(worker).toHaveAttribute("data-presence", "cancelled", { timeout: 30_000 });
  await expect(worker).toHaveAttribute("data-station", "lounge");
  await expect(worker.getByText("Work stopped", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Virtual Office", exact: true }).click();
  await expect(worker).toHaveAttribute("data-bot-id", botId as string);
  await expect(worker).toHaveAttribute("data-presence", "cancelled", { timeout: 30_000 });
  await expect(worker).toHaveAttribute("data-station", "lounge");
  await worker.getByRole("button", { name: "Inspect Chief task", exact: true }).click();
  await expect(task).toHaveAttribute("data-task-id", taskId as string);
  await expect(task.getByText("cancelled", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(task.getByRole("button", { name: "Stop task tree", exact: true })).toHaveCount(0);
});

test("plugins can register declarative GitHub extensions", async ({ page }) => {
  const stamp = Date.now();
  await signup(page, `github-extension-${stamp}@rakazo.test`, "password12", "Extension Runtime");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

  await page.getByText("Plugins", { exact: true }).click();
  await page.getByRole("tab", { name: "GitHub Extensions" }).click();
  await expect(page.getByRole("heading", { name: "GitHub Extensions", exact: true })).toBeVisible();
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
