import { describe, expect, it } from "vitest";
import { MessageBlock } from "./events.js";

describe("file message blocks", () => {
  it("accepts a real persisted artifact reference with file metadata", () => {
    expect(
      MessageBlock.parse({
        kind: "file",
        artifactId: "artifact-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 42_000,
      }),
    ).toEqual({
      kind: "file",
      artifactId: "artifact-1",
      name: "report.pdf",
      mimeType: "application/pdf",
      size: 42_000,
    });
  });

  it("rejects negative file sizes and missing artifact ids", () => {
    expect(
      MessageBlock.safeParse({
        kind: "file",
        artifactId: "artifact-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: -1,
      }).success,
    ).toBe(false);
    expect(
      MessageBlock.safeParse({
        kind: "file",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 10,
      }).success,
    ).toBe(false);
  });
});
