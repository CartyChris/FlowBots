import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionApprovals } from "./ActionApprovals.js";

describe("ActionApprovals", () => {
  it("shows an explicit per-bot permission policy and only real pending-action controls", () => {
    const html = renderToStaticMarkup(
      <ActionApprovals
        bot={{ id: "bot-1", name: "Nova", title: "Developer" } as never}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('aria-labelledby="action-approvals-title"');
    expect(html).toContain('id="action-policy-mode"');
    expect(html).toContain("Approving never grants another bot&#x27;s permissions");
    expect(html).toContain("No action is waiting for approval.");
  });
});
