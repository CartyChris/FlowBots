import { expect, it } from "vitest";
import { assertEffectIdentity } from "./effect-identity.js";

it("compares stored JSON independent of database object key order", () => {
  expect(() =>
    assertEffectIdentity(
      { workspaceId: "w", runId: "r", kind: "delegate_team", request: { b: 2, a: { d: 4, c: 3 } } },
      { workspaceId: "w", runId: "r", kind: "delegate_team", request: { a: { c: 3, d: 4 }, b: 2 } },
    ),
  ).not.toThrow();
});
it.each([
  { runId: "different" },
  { workspaceId: "different" },
  { kind: "shell" },
  { request: { task: "different" } },
])("rejects mismatched effect replay %j", (change) => {
  const expected = {
    workspaceId: "w",
    runId: "r",
    kind: "delegate_team",
    request: { task: "original" },
  };
  expect(() => assertEffectIdentity({ ...expected, ...change }, expected)).toThrow(/identity/i);
});
