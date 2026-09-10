import { describe, expect, test } from "bun:test";
import { createStandaloneDispatcher, RelkitStreamError } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { defineFunction, streamOf } from "./src/index.ts";

describe("streamOf invocation", () => {
  test("starts lazily, validates items, and cleans up on consumer return", async () => {
    const events: string[] = [];
    const target = defineFunction({
      id: "reports.stream",
      input: z.object({}),
      output: streamOf(z.number().int()),
      handler: async function* () {
        events.push("started");
        try {
          yield 1;
          yield 2;
        } finally {
          events.push("closed");
        }
      },
    });
    const dispatcher = createStandaloneDispatcher();
    const stream = await dispatcher.dispatch({ target, input: {} });
    expect(events).toEqual([]);
    for await (const value of stream) {
      expect(value).toBe(1);
      break;
    }
    expect(events).toEqual(["started", "closed"]);
  });

  test("rejects a second consumer", async () => {
    const target = defineFunction({
      id: "reports.once",
      input: z.object({}),
      output: streamOf(z.string()),
      handler: async function* () {
        yield "ok";
      },
    });
    const stream = await target.invoke({});
    const first = stream[Symbol.asyncIterator]();
    const second = stream[Symbol.asyncIterator]();
    expect(await first.next()).toEqual({ value: "ok", done: false });
    await expect(second.next()).rejects.toBeInstanceOf(RelkitStreamError);
    await first.return?.();
  });

  test("rejects invalid and oversized items", async () => {
    const invalid = defineFunction({
      id: "reports.invalid",
      input: z.object({}),
      output: streamOf(z.string()),
      handler: async function* () {
        yield 1 as never;
      },
    });
    await expect((await invalid.invoke({}))[Symbol.asyncIterator]().next()).rejects.toThrow(
      "Stream item validation failed",
    );

    const oversized = defineFunction({
      id: "reports.large",
      input: z.object({}),
      output: streamOf(z.string()),
      handler: async function* () {
        yield "x".repeat(1024 * 1024);
      },
    });
    await expect((await oversized.invoke({}))[Symbol.asyncIterator]().next()).rejects.toMatchObject(
      {
        code: "RELKIT_STREAM_ITEM_TOO_LARGE",
      },
    );
  });
});
