/** Checks that `getRelkit()` reads the handle from asynchronous context and fails with a coded
 * error where no application runs, including in a bare script.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { defineFunction } from "../../src/app/index.js";
import { defineEvent } from "../../src/events/index.js";
import { z } from "../../src/schema/index.js";
import { defineService } from "../../src/services/index.js";
import { createRelkit } from "../../src/functions/create-relkit.js";
import {
  ApplicationNotRunningError,
  createRuntimeHandle,
  getRelkit,
  runWithRelkit,
} from "../../src/engine/runtime-handle.js";

const execute = promisify(execFile);

const priceOrder = defineFunction({
  id: "orders.price-order",
  input: z.object({ quantity: z.number() }),
  output: z.object({ totalCents: z.number() }),
  handler: async ({ quantity }) => ({ totalCents: quantity * 100 }),
});
const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ orderId: z.string() }),
});
const orders = defineService({ functions: { priceOrder }, events: { orderCreated } });

function handle() {
  const calls: unknown[] = [];
  const published: unknown[] = [];
  const relkit = createRuntimeHandle({
    services: { orders },
    invoke: async (functionId, input) => {
      calls.push([functionId, input]);
      return { totalCents: 300 };
    },
    descriptors: { cache: { "orders.prices": { ref: { kind: "cache", id: "orders.prices" } } } },
    sources: {
      events: {
        "orders.created": { publish: async (payload: unknown) => void published.push(payload) },
      },
      cache: { "orders.prices": { get: async () => 7 } },
    },
    database: { orders: { findMany: async () => [] } },
  });
  return { relkit, calls, published };
}

describe("runtime handle", () => {
  test("getRelkit fails with a coded error that points to createRelkit", () => {
    expect(() => getRelkit()).toThrow(ApplicationNotRunningError);
    try {
      getRelkit();
    } catch (error) {
      expect(error).toMatchObject({ code: "RELKIT_APPLICATION_NOT_RUNNING" });
      expect((error as Error).message).toContain("createRelkit");
    }
  });

  test("the handle follows asynchronous continuations of the code that runs with it", async () => {
    const { relkit, calls, published } = handle();
    const result = await runWithRelkit(relkit, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const current = getRelkit() as unknown as {
        readonly functions: Record<string, Record<string, (input: unknown) => Promise<unknown>>>;
        readonly events: Record<string, Record<string, { publish: (p: unknown) => Promise<void> }>>;
        readonly cache: Record<string, { get: (key: string) => Promise<unknown> }>;
      };
      await current.events.orders!.orderCreated!.publish({ orderId: "o1" });
      return {
        price: await current.functions.orders!.priceOrder!({ quantity: 3 }),
        cached: await current.cache["orders.prices"]!.get("sku"),
      };
    });
    expect(result).toEqual({ price: { totalCents: 300 }, cached: 7 });
    expect(calls).toEqual([["orders.price-order", { quantity: 3 }]]);
    expect(published).toEqual([{ orderId: "o1" }]);
    expect(() => getRelkit()).toThrow(ApplicationNotRunningError);
  });

  test("a bare script gets the coded error", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-handle-"));
    const entry = fileURLToPath(new URL("../../src/index.ts", import.meta.url));
    const script = join(directory, "script.ts");
    await writeFile(
      script,
      `import { getRelkit } from ${JSON.stringify(entry)};
try { getRelkit(); } catch (error) { console.log(error.code); }
`,
    );
    try {
      const { stdout } = await execute("bun", ["run", script]);
      expect(stdout.trim()).toBe("RELKIT_APPLICATION_NOT_RUNNING");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("createRelkit needs the application's configuration and a build", async () => {
    await expect(createRelkit({ ref: { kind: "service" } } as never)).rejects.toThrow(
      "defineApp",
    );
    const directory = await mkdtemp(join(tmpdir(), "relkit-create-"));
    try {
      await expect(
        createRelkit({ ref: { kind: "app" } }, { root: directory }),
      ).rejects.toMatchObject({ code: "RELKIT_APPLICATION_BUILD_UNAVAILABLE" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
