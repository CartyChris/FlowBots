import { expect, type Page, test } from "@playwright/test";

test("voice requires disclosure, keeps transcripts in drafts, stops, and drops old-room events", async ({
  page,
}) => {
  await installVoiceDouble(page);
  const stamp = Date.now();
  await signup(page, `voice-${stamp}@rakazo.test`, "password12", "Voice");
  await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);
  await createBot(page, "Randy", "Research specialist", "Find evidence.");

  await createGroup(page, "Room A", ["Chief", "Randy"]);
  await page.getByRole("button", { name: "Direct chats" }).click();
  await createGroup(page, "Room B", ["Chief", "Randy"]);
  await page.getByRole("button", { name: "Room A", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room A", exact: true })).toBeVisible();

  const composer = page.getByPlaceholder("Message Room A");
  await composer.fill("Keep this draft");
  await page.getByRole("button", { name: "Start voice input" }).click();
  await expect(
    page
      .locator("p")
      .filter({ hasText: "Speech recognition may send audio to your browser vendor." }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__voiceTest.starts)).toBe(0);
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect.poll(() => page.evaluate(() => window.__voiceTest.starts)).toBe(1);

  await page.evaluate(() => window.__voiceTest.instances[0]?.emitFinal("transcribed words"));
  await expect(composer).toHaveValue("Keep this draft transcribed words");
  await expect(page.getByText("transcribed words", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Stop voice input" }).click();
  await expect.poll(() => page.evaluate(() => window.__voiceTest.aborts)).toBe(1);

  await page.getByRole("button", { name: "Start voice input" }).click();
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect.poll(() => page.evaluate(() => window.__voiceTest.starts)).toBe(2);
  await page.getByRole("button", { name: "Room B", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room B", exact: true })).toBeVisible();
  await page.evaluate(() => window.__voiceTest.instances[1]?.emitFinal("old room leak"));
  await expect(page.getByPlaceholder("Message Room B")).not.toHaveValue(/old room leak/);
});

async function installVoiceDouble(page: Page) {
  await page.addInitScript(() => {
    class Recognition {
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        window.__voiceTest.starts += 1;
      }
      stop() {}
      abort() {
        window.__voiceTest.aborts += 1;
      }
      emitFinal(transcript: string) {
        this.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript }, length: 1 }],
        });
      }
    }
    window.__voiceTest = { starts: 0, aborts: 0, instances: [] };
    (window as unknown as { webkitSpeechRecognition: typeof Recognition }).webkitSpeechRecognition =
      class extends Recognition {
        constructor() {
          super();
          window.__voiceTest.instances.push(this);
        }
      };
  });
}

async function createBot(page: Page, name: string, title: string, description: string) {
  await page.getByTitle("New bot").click();
  await page.getByPlaceholder("Name this bot").fill(name);
  await page.getByPlaceholder("Describe what this bot does").fill(title);
  await page.getByPlaceholder("What this bot is for").fill(description);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByPlaceholder(`Message ${name}`)).toBeVisible();
}

async function createGroup(page: Page, name: string, members: string[]) {
  await page.getByRole("button", { name: "New group chat" }).click();
  await page.getByLabel("Group name").fill(name);
  for (const member of members) await page.getByRole("checkbox", { name: member }).check();
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
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

declare global {
  interface Window {
    __voiceTest: {
      starts: number;
      aborts: number;
      instances: Array<{ emitFinal: (transcript: string) => void }>;
    };
  }
}
