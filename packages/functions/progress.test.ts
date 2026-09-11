import { describe, expect, test } from "bun:test";
import { createStandaloneDispatcher } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { defineFunction } from "./src/index.ts";

describe("function progress", () => {
  test("validates and discards unobserved progress without blocking", async () => {
    const target = defineFunction({
      id: "reports.progress",
      input: z.object({}),
      output: z.string(),
      progress: z.object({ stage: z.string() }),
      handler: async (_input, context) => {
        await context.progress.emit({ stage: "loading" });
        return "done";
      },
    });
    expect(await target.invoke({})).toBe("done");
  });

  test("delivers validated records to an explicit sink", async () => {
    const records: unknown[] = [];
    const target = defineFunction({
      id: "reports.observed-progress",
      input: z.object({}),
      output: z.string(),
      progress: z.number().int(),
      handler: async (_input, context) => {
        await context.progress.emit(1);
        return "done";
      },
    });
    const dispatcher = createStandaloneDispatcher({
      progressSink: { emit: (value) => records.push(value) },
    });
    expect(await dispatcher.dispatch({ target, input: {} })).toBe("done");
    expect(records).toEqual([1]);
  });

  test("rejects invalid and oversized records", async () => {
    const target = defineFunction({
      id: "reports.invalid-progress",
      input: z.object({}),
      output: z.string(),
      progress: z.string(),
      handler: async (_input, context) => {
        await expect(context.progress.emit(1 as never)).rejects.toMatchObject({
          code: "RELKIT_PROGRESS_VALIDATION",
        });
        await expect(context.progress.emit("x".repeat(256 * 1024))).rejects.toMatchObject({
          code: "RELKIT_PROGRESS_TOO_LARGE",
        });
        return "done";
      },
    });
    expect(await target.invoke({})).toBe("done");
  });
});
