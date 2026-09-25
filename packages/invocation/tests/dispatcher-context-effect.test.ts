import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  DependencyNotConfiguredError,
  ManagedDependencyFailure,
  configuredMapEffect,
  createManagedMapsEffect,
  makeStandaloneContext,
  makeStandaloneContextEffect,
  readManagedDependencyEffect,
} from "../src/dispatcher-context.js";
import type { InvocationRecord, PublicClock } from "../src/index.js";

const record: InvocationRecord = {
  id: "invocation-1",
  functionId: "tasks.run",
  traceId: "trace-1",
  startedAt: new Date(0).toISOString(),
  attempt: 1,
  source: "direct",
  status: "started",
};
const time: PublicClock = { now: () => new Date(100), sleep: async () => undefined };

describe("standalone context Effect", () => {
  test("installs configured maps and filters published event clients", async () => {
    const signal = new AbortController().signal;
    const context = await Effect.runPromise(
      makeStandaloneContextEffect({
        record,
        signal,
        env: { mode: "test" },
        time,
        publishes: ["events.posted"],
        clients: {
          cache: { main: { ping: true } },
          events: { "events.posted": { emit: true }, "events.hidden": { emit: false } },
        },
      }),
    );
    expect((context as any).cache.main).toEqual({ ping: true });
    expect((context as any).events["events.posted"]).toEqual({ emit: true });
    expect(() => (context as any).events["events.hidden"]).toThrow(DependencyNotConfiguredError);
    expect(Object.isFrozen(context)).toBe(true);
  });

  test("tags missing clients and keeps the proxy error", () => {
    const failure = Effect.runSync(
      Effect.catchTag(
        readManagedDependencyEffect("cache", {}, "main"),
        "ManagedDependencyFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(ManagedDependencyFailure);
    expect(failure.cause).toBeInstanceOf(DependencyNotConfiguredError);
    const map = Effect.runSync(configuredMapEffect("cache", {}));
    expect(() => map.main).toThrow(DependencyNotConfiguredError);
    const maps = Effect.runSync(createManagedMapsEffect({ cache: { main: 1 } }));
    expect(maps.cache?.main).toBe(1);
  });

  test("preserves a custom context factory rejection", async () => {
    const cause = new Error("factory failed");
    const options = {
      factory: async () => {
        throw cause;
      },
      record,
      signal: new AbortController().signal,
      env: {},
      time,
      publishes: [],
    };
    await expect(makeStandaloneContext(options)).rejects.toBe(cause);
  });
});
