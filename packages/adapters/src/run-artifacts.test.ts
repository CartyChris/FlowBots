import { describe, expect, it } from "vitest";
import {
  MAX_ARTIFACT_BYTES,
  MAX_RUN_ARTIFACTS,
  mimeTypeForArtifact,
  selectChangedRunArtifacts,
} from "./run-artifacts.js";

describe("run artifact delivery", () => {
  it("selects relevant changed deliverables and ignores unchanged/internal files", () => {
    const before = new Map([
      ["report.pdf", { size: 100, modifiedAt: 1 }],
      ["notes.md", { size: 50, modifiedAt: 1 }],
    ]);
    const after = [
      { path: "report.pdf", size: 120, modifiedAt: 2 },
      { path: "notes.md", size: 50, modifiedAt: 1 },
      { path: "deck.pptx", size: 500, modifiedAt: 2 },
      { path: "site/index.html", size: 1_000, modifiedAt: 2 },
      { path: "node_modules/pkg/index.js", size: 200, modifiedAt: 2 },
      { path: ".cache/tmp.json", size: 20, modifiedAt: 2 },
    ];

    expect(selectChangedRunArtifacts(before, after).map((file) => file.path)).toEqual([
      "deck.pptx",
      "report.pdf",
      "site/index.html",
    ]);
  });

  it("caps file count and rejects files over the per-artifact safety bound", () => {
    const after = Array.from({ length: MAX_RUN_ARTIFACTS + 5 }, (_, index) => ({
      path: `result-${index}.pdf`,
      size: index === 0 ? MAX_ARTIFACT_BYTES + 1 : 100 + index,
      modifiedAt: 2,
    }));
    const selected = selectChangedRunArtifacts(new Map(), after);
    expect(selected).toHaveLength(MAX_RUN_ARTIFACTS);
    expect(selected.some((file) => file.path === "result-0.pdf")).toBe(false);
  });

  it("maps common bot deliverables to concrete MIME types", () => {
    expect(mimeTypeForArtifact("report.pdf")).toBe("application/pdf");
    expect(mimeTypeForArtifact("brief.docx")).toContain("wordprocessingml");
    expect(mimeTypeForArtifact("deck.pptx")).toContain("presentationml");
    expect(mimeTypeForArtifact("app.html")).toBe("text/html");
    expect(mimeTypeForArtifact("data.csv")).toBe("text/csv");
    expect(mimeTypeForArtifact("bundle.zip")).toBe("application/zip");
    expect(mimeTypeForArtifact("image.png")).toBe("image/png");
  });
});
