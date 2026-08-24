import { describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { defineEnv, env } from "@zsys/config";
import { z } from "@zsys/schema";
import { createTestRuntime, invokeFunction } from "./src/index.ts";

let observedContext:
  | {
      readonly env: Readonly<Record<string, unknown>>;
      readonly time: { readonly now: () => Date };
      readonly signal: AbortSignal;
    }
  | undefined;
let observedRecord: { readonly source: string } | undefined;

const target = {
  id: "testing.echo",
  input: z.object({ value: z.number() }),
  output: z.object({ value: z.number(), now: z.number() }),
  handler: async (
    input: { value: number },
    context: {
      readonly env: Readonly<Record<string, unknown>>;
      readonly time: { now: () => Date };
      readonly signal: AbortSignal;
    },
  ) => {
    observedContext = context;
    return {
      value: input.value + Number(context.env.offset ?? 0),
      now: context.time.now().getTime(),
    };
  },
};

describe("testing runtime foundation", () => {
  test("invokes directly with a validated default context", async () => {
    const result = await invokeFunction(
      target,
      { value: 2 },
      {
        env: { offset: 3 },
        hooks: { onInvocationStart: (record) => (observedRecord = record) },
      },
    );
    expect(result).toEqual({ value: 5, now: expect.any(Number) });
    expect(observedRecord?.source).toBe("direct");
    expect(observedContext !== undefined && Object.isFrozen(observedContext)).toBe(true);
    expect(observedContext !== undefined && Object.isFrozen(observedContext.env)).toBe(true);
  });

  test("supplies deterministic dependency fakes to direct invocations", async () => {
    const dependent = {
      id: "testing.dependencies",
      input: z.object({ message: z.string() }),
      output: z.object({ accepted: z.boolean() }),
      dependencies: {
        buckets: {
          assets: { ref: { kind: "bucket", id: "testing.assets" } },
        },
        events: {
          notice: {
            ref: { kind: "event", id: "testing.notice" },
            version: 1,
            payload: z.object({ message: z.string() }),
          },
        },
      },
      handler: async (
        input: { readonly message: string },
        context: {
          readonly buckets: {
            readonly assets: {
              put(key: string, bytes: Uint8Array, options: unknown): Promise<void>;
            };
          };
          readonly events: { readonly notice: { publish(value: unknown): Promise<unknown> } };
        },
      ) => {
        const result = (await context.events.notice.publish(input)) as {
          readonly accepted: boolean;
        };
        await context.buckets.assets.put(
          "messages/hello.txt",
          new TextEncoder().encode(input.message),
          { contentType: "text/plain" },
        );
        return { accepted: result.accepted };
      },
    };

    await expect(invokeFunction(dependent, { message: "hello" })).resolves.toEqual({
      accepted: true,
    });
  });

  test("resolves test environment values through the app definition", () => {
    const app = {
      env: defineEnv({
        port: env.number().default(3000),
        required: env.string().requiredIn("test"),
      }),
    };
    const runtime = createTestRuntime({ app, env: { port: 0, required: "ok" } });
    expect(runtime.env).toEqual({ port: 0, required: "ok" });
    expect(Object.isFrozen(runtime.env)).toBe(true);
    expect(() => createTestRuntime({ app, env: { port: "bad", required: "ok" } })).toThrow();
  });

  test("uses deterministic time and closes pending work within its bound", async () => {
    const runtime = createTestRuntime({ env: { offset: 4 }, startTimeMs: 100 });
    const ids: string[] = [];
    const pending = runtime.invoke(
      target,
      { value: 1 },
      {
        hooks: { onInvocationStart: (record) => ids.push(record.id) },
      },
    );
    await runtime.clock.advance(0);
    expect(await pending).toEqual({ value: 5, now: 100 });
    expect(ids).toEqual(["test-invocation-2"]);
    await runtime.close();
    await runtime.close();
    await expect(runtime.invoke(target, { value: 1 })).rejects.toThrow("closed");
  });

  test("isolates state and fake clients, retaining failed state when requested", async () => {
    const previous = process.env.ZSYS_KEEP_TEST_STATE;
    process.env.ZSYS_KEEP_TEST_STATE = "1";
    const first = createTestRuntime();
    const second = createTestRuntime();
    const retainedRoot = first.stateRoot;
    try {
      expect(first.stateRoot).not.toBe(second.stateRoot);
      expect(first.fakes).not.toBe(second.fakes);
      expect(first.fakes.clients).not.toBe(second.fakes.clients);
      expect(existsSync(first.stateRoot)).toBe(true);
      await first.close({ failed: true });
      expect(existsSync(retainedRoot)).toBe(true);
      await second.close();
      expect(existsSync(second.stateRoot)).toBe(false);
    } finally {
      rmSync(retainedRoot, { recursive: true, force: true });
      if (previous === undefined) delete process.env.ZSYS_KEEP_TEST_STATE;
      else process.env.ZSYS_KEEP_TEST_STATE = previous;
    }
  });
});
