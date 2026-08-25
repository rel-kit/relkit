import { describe, expect, test } from "bun:test";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import {
  createObservabilityCollector,
  type RequestRecord,
  type SpanRecord,
} from "@zsys/observability";
import type { RegistrationPlan } from "@zsys/graph";
import { createApp, type RateLimitCounter, type RuntimeManifest } from "./src/index.js";

const source = { file: "src/routes/limited/route.ts", line: 1, column: 1 } as const;

describe("route rate limiting", () => {
  test("uses generation-local memory with standard headers and a safe response", async () => {
    const calls: string[] = [];
    const app = createApp({
      plan: plan({ limit: 2, windowMs: 1_000, key: { kind: "constant", value: "all" } }),
      manifest: manifest(),
      engine: {
        invoke: async ({ functionId }) => {
          calls.push(functionId);
          return { ok: true };
        },
      },
    });

    expect((await app.request("http://localhost/limited")).status).toBe(200);
    const second = await app.request("http://localhost/limited");
    const blocked = await app.request("http://localhost/limited");

    expect(second.headers.get("ratelimit-limit")).toBe("2");
    expect(second.headers.get("ratelimit-remaining")).toBe("0");
    expect(second.headers.get("ratelimit-reset")).toBe("1");
    expect(second.headers.get("ratelimit-policy")).toBe("2;w=1");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.json()).toEqual({
      error: "rate-limit",
      retryAfterMs: expect.any(Number),
    });
    expect(calls).toEqual(["hello", "hello"]);
  });

  test("shares counters across runtimes, isolates keys, expires windows, and records telemetry", async () => {
    const counter = memoryCounter();
    const collector = createObservabilityCollector();
    const events: string[] = [];
    const rateLimit = {
      limit: 1,
      windowMs: 40,
      key: { kind: "header", name: "x-api-key" },
      storeId: "api-limits",
    } as const;
    const create = () =>
      createApp({
        plan: plan(rateLimit, true),
        manifest: manifest(),
        observability: collector,
        rateLimitRuntime: {
          resolveStore: () => ({
            ...counter,
            increment: async (...arguments_) => {
              events.push("rate-limit");
              return counter.increment(...arguments_);
            },
          }),
        },
        engine: {
          invoke: async ({ functionId }) => {
            events.push(functionId);
            return { ok: true };
          },
        },
      });
    const firstRuntime = create();
    const secondRuntime = create();

    expect(
      (await firstRuntime.request("http://localhost/limited", { headers: { "x-api-key": "a" } }))
        .status,
    ).toBe(200);
    expect(
      (await secondRuntime.request("http://localhost/limited", { headers: { "x-api-key": "a" } }))
        .status,
    ).toBe(429);
    expect(
      (await secondRuntime.request("http://localhost/limited", { headers: { "x-api-key": "b" } }))
        .status,
    ).toBe(200);
    await Bun.sleep(50);
    expect(
      (await secondRuntime.request("http://localhost/limited", { headers: { "x-api-key": "a" } }))
        .status,
    ).toBe(200);

    expect(events.slice(0, 2)).toEqual(["rate-limit", "hello"]);
    const records = collector.read();
    const blocked = records.find(
      (record): record is RequestRecord => record.signal === "request" && record.status === 429,
    );
    const span = records.find(
      (record): record is SpanRecord =>
        record.signal === "span" &&
        record.status === "completed" &&
        record.attributes?.["zsys.rate_limit.blocked"] === true,
    );
    expect(blocked).toMatchObject({
      routeId: "limited.http",
      functionId: "hello",
      outcome: "declared-error",
      errorId: "rate-limit",
    });
    expect(span?.attributes).toMatchObject({
      "zsys.route.id": "limited.http",
      "zsys.rate_limit.limit": 1,
      "zsys.rate_limit.remaining": 0,
      "zsys.rate_limit.blocked": true,
      "zsys.rate_limit.store": "shared",
    });
    expect(JSON.stringify(records)).not.toContain('x-api-key":"a');
  });
});

function plan(
  rateLimit: NonNullable<RegistrationPlan["httpTriggers"][number]["config"]["rateLimit"]>,
  shared = false,
): RegistrationPlan {
  return {
    graphHash: "sha256:rate-limit",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "limited.http",
        source,
        triggerType: "http",
        targetFunctionId: "hello",
        config: {
          method: "GET",
          path: "/limited",
          request: { kind: "input", fields: {} },
          responses: [],
          middleware: [],
          transforms: [],
          rateLimit,
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: shared
      ? [{ kind: "cache", id: "api-limits", source, key: {}, value: {}, profile: "default" }]
      : [],
    tools: [],
    agents: [],
    middlewares: [],
  };
}

function manifest(): RuntimeManifest {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: "sha256:rate-limit",
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}

function memoryCounter(): RateLimitCounter {
  const values = new Map<string, { readonly value: number; readonly expiresAt: number }>();
  const read = (key: string) => {
    const value = values.get(key);
    if (value !== undefined && value.expiresAt > Date.now()) return value;
    values.delete(key);
    return undefined;
  };
  return {
    get: async (key) => read(key)?.value,
    increment: async (key, delta, options) => {
      const value = (read(key)?.value ?? 0) + delta;
      values.set(key, { value, expiresAt: Date.now() + (options?.ttlMs ?? 60_000) });
      return value;
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}
