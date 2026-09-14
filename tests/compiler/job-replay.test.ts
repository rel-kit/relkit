import { describe, expect, test } from "bun:test";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";

const source = { file: "src/routes/wait.task.ts", line: 1, column: 1 } as const;

function taskExport(): Record<string, unknown> {
  return {
    descriptor: {
      kind: "task",
      id: "orders.wait",
      ref: { kind: "task", id: "orders.wait" },
      metadata: {
        input: { $relkit: "schema", jsonSchema: { type: "object" } },
        output: { $relkit: "schema", jsonSchema: { type: "object" } },
        version: "1",
        execution: "durable",
      },
    },
    exportName: "waitForOrder",
    exportKind: "named",
    source,
    reference: {
      generationId: "test",
      descriptorId: "orders.wait",
      kind: "task",
      module: source.file,
      exportName: "waitForOrder",
    },
  };
}

describe("durable task replay advisories", () => {
  test("warns about unstable wait identity and work before a wait without blocking activation", () => {
    const result = normalizeCompilation({
      extracted: [taskExport()],
      sources: [{
        fileName: source.file,
        text: "await fetch(url); await ctx.sleep(\"1 hour\", { key: Date.now().toString() });",
      }],
    });

    expect(result.activatable).toBe(true);
    const advisories = result.diagnostics.filter(({ code }) => code === "RELKIT_JOB_REPLAY_ADVISORY");
    expect(advisories).toHaveLength(2);
    expect(advisories.every(({ severity, file }) => severity === "warning" && file === source.file)).toBe(true);
    expect(advisories.some(({ suggestion }) => typeof suggestion === "string" && suggestion.includes("accepted-input"))).toBe(true);
    expect(advisories.some(({ message }) => message.includes("External work"))).toBe(true);
  });

  test("does not warn for a stable accepted-input-derived wait key", () => {
    const result = normalizeCompilation({
      extracted: [taskExport()],
      sources: [{
        fileName: source.file,
        text: "await ctx.sleep(\"1 hour\", { key: input.orderId });",
      }],
    });

    expect(result.diagnostics.filter(({ code }) => code === "RELKIT_JOB_REPLAY_ADVISORY")).toEqual([]);
    expect(result.activatable).toBe(true);
  });
});
