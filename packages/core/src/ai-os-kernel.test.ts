import { describe, expect, test } from "vitest";
import * as core from "./index.js";

function required<T extends (...args: any[]) => any>(name: string): T | undefined {
  const value = (core as Record<string, unknown>)[name];
  expect(typeof value, `${name} must be exported by @rakazo/core`).toBe("function");
  return typeof value === "function" ? (value as T) : undefined;
}

describe("Local AI OS core kernel", () => {
  test("model catalogs union shipped, synced, and custom ids without deleting user choices", () => {
    const merge =
      required<(input: { defaults?: string[]; synced?: string[]; custom?: string[] }) => string[]>(
        "mergeModelCatalog",
      );
    if (!merge) return;
    expect(
      merge({
        defaults: ["openai/gpt-5", "shared"],
        synced: ["shared", "new/provider-model"],
        custom: ["private/deployment", "openai/gpt-5"],
      }),
    ).toEqual(["openai/gpt-5", "shared", "new/provider-model", "private/deployment"]);
  });

  test("objective failures override a perfect judge score", () => {
    const judge =
      required<
        (input: {
          runtimeErrors?: number;
          regressions?: number;
          highSeverityFlags?: number;
          score?: number;
          requiredScore?: number;
        }) => { passed: boolean; reasons: string[] }
      >("judgeFeatureEvidence");
    if (!judge) return;

    expect(judge({ score: 100, runtimeErrors: 1 }).passed).toBe(false);
    expect(judge({ score: 100, regressions: 1 }).passed).toBe(false);
    expect(judge({ score: 100, highSeverityFlags: 1 }).passed).toBe(false);
    expect(judge({ score: 79, requiredScore: 80 }).passed).toBe(false);
    expect(judge({ score: 80, requiredScore: 80 }).passed).toBe(true);
  });

  test("unverified local-worker mutations cannot be promoted", () => {
    const mayPromote =
      required<
        (input: {
          checksPassed: boolean;
          highSeverityFlags?: number;
          humanRequired?: boolean;
          humanApproved?: boolean;
        }) => boolean
      >("canPromoteCandidate");
    if (!mayPromote) return;

    expect(mayPromote({ checksPassed: false })).toBe(false);
    expect(mayPromote({ checksPassed: true, highSeverityFlags: 1 })).toBe(false);
    expect(mayPromote({ checksPassed: true, humanRequired: true, humanApproved: false })).toBe(
      false,
    );
    expect(mayPromote({ checksPassed: true, humanRequired: true, humanApproved: true })).toBe(true);
  });

  test("cost per completed task includes abandoned spend", () => {
    const cpct =
      required<(runs: Array<{ cost: number; completed: boolean }>) => number | null>(
        "costPerCompletedTask",
      );
    if (!cpct) return;

    expect(
      cpct([
        { cost: 1.25, completed: false },
        { cost: 2.75, completed: true },
      ]),
    ).toBe(4);
    expect(cpct([{ cost: 2, completed: false }])).toBeNull();
  });

  test("hard budgets stop a call before spend exceeds limits", () => {
    const check =
      required<
        (input: {
          spent: number;
          estimatedNextCost: number;
          calls: number;
          rounds: number;
          subagents: number;
          maxSpend?: number;
          maxCalls?: number;
          maxRounds?: number;
          maxSubagents?: number;
        }) => { allowed: boolean; reason?: string }
      >("checkRunBudget");
    if (!check) return;

    expect(
      check({ spent: 9, estimatedNextCost: 2, calls: 1, rounds: 1, subagents: 0, maxSpend: 10 })
        .allowed,
    ).toBe(false);
    expect(
      check({ spent: 1, estimatedNextCost: 1, calls: 3, rounds: 1, subagents: 0, maxCalls: 3 })
        .allowed,
    ).toBe(false);
    expect(
      check({ spent: 1, estimatedNextCost: 1, calls: 1, rounds: 1, subagents: 0, maxSpend: 10 })
        .allowed,
    ).toBe(true);
  });

  test("trace parentage is explicit and remains correct when siblings finish out of order", () => {
    const create =
      required<
        () => {
          start(input: { name: string; kind: string; parentId?: string }): string;
          end(id: string, input?: { error?: string; cost?: number }): void;
          tree(): Array<{
            id: string;
            name: string;
            children: Array<{ id: string; name: string }>;
          }>;
        }
      >("createRunTrace");
    if (!create) return;

    const trace = create();
    const root = trace.start({ name: "orchestrator", kind: "agent" });
    const a = trace.start({ name: "researcher", kind: "llm", parentId: root });
    const b = trace.start({ name: "builder", kind: "llm", parentId: root });
    trace.end(a);
    trace.end(b);
    trace.end(root);

    const [node] = trace.tree();
    expect(node?.children.map((child) => child.name)).toEqual(["researcher", "builder"]);
  });

  test("standing feedback favors recent corrections but keeps some positive signal", () => {
    const select =
      required<
        (
          rows: Array<{ good: boolean; note: string; ts: string }>,
          options?: { negativeLimit?: number; positiveLimit?: number },
        ) => { negative: string[]; positive: string[] }
      >("selectStandingFeedback");
    if (!select) return;

    const rows = [
      ...Array.from({ length: 8 }, (_, i) => ({
        good: false,
        note: `bad-${i}`,
        ts: new Date(2026, 0, i + 1).toISOString(),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        good: true,
        note: `good-${i}`,
        ts: new Date(2026, 1, i + 1).toISOString(),
      })),
    ];
    const selected = select(rows);
    expect(selected.negative).toHaveLength(6);
    expect(selected.positive).toHaveLength(3);
    expect(selected.negative[0]).toBe("bad-7");
    expect(selected.positive[0]).toBe("good-4");
  });
});
