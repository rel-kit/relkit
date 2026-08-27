import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import type { InvocationRunner } from "@relkit/runtime-effect";
import {
  DependencyAccessError,
  buildDependencyClients,
  type DependencyBridge,
  type DependencyClientSources,
} from "./src/dependencies.ts";
import { invokeFunction, type InvocationContext, type InvocationTarget } from "./src/index.ts";

const ref = (kind: string, id: string) => ({ ref: { kind, id } });

describe("declared dependency clients", () => {
  test("exposes declared names, bridges every operation, and separates edge hooks", async () => {
    const bridged: string[] = [];
    const declared: unknown[] = [];
    const observed: unknown[] = [];
    const operations: unknown[] = [];
    const bridge: DependencyBridge = {
      run: async <A>(operation, options) => {
        bridged.push(options?.name ?? "missing");
        return operation();
      },
      runVoid: async (operation) => {
        operation();
      },
    };
    const sources: DependencyClientSources = {
      jobs: { send: { enqueue: async (input) => ({ input }) } },
      events: { "orders.created": { publish: async (payload) => ({ payload }) } },
      buckets: { files: { put: async () => undefined, get: async () => new Uint8Array() } },
      cache: { prices: { get: async () => 3, set: async () => undefined } },
      agents: { summarize: async (input) => ({ input }) },
    };
    const clients = buildDependencyClients({
      ownerId: "orders.handle",
      dependencies: {
        jobs: { send: ref("job", "orders.send") },
        events: { created: ref("event", "orders.created") },
        buckets: { files: ref("bucket", "orders.files") },
        cache: { prices: ref("cache", "orders.prices") },
        agents: { summarize: ref("agent", "orders.summarize") },
      },
      sources,
      bridge,
      onDeclaredEdge: (edge) => declared.push(edge),
      onObservedEdge: (edge) => observed.push(edge),
      onOperation: (operation) => operations.push(operation),
    });

    await (clients.jobs.send as { enqueue: (input: unknown) => Promise<unknown> }).enqueue({});
    await (clients.events.created as { publish: (input: unknown) => Promise<unknown> }).publish({});
    await (clients.buckets.files as { put: (...input: unknown[]) => Promise<unknown> }).put(
      "a",
      new Uint8Array(),
    );
    await (clients.cache.prices as { get: (input: unknown) => Promise<unknown> }).get("a");
    await (clients.agents.summarize as (input: unknown) => Promise<unknown>)({});

    expect(bridged).toHaveLength(5);
    expect(declared).toEqual([
      { kind: "enqueues-job", from: "orders.handle", to: "orders.send" },
      { kind: "publishes-event", from: "orders.handle", to: "orders.created" },
      { kind: "uses-bucket", from: "orders.handle", to: "orders.files" },
      { kind: "uses-cache", from: "orders.handle", to: "orders.prices" },
      { kind: "invokes-agent", from: "orders.handle", to: "orders.summarize" },
    ]);
    expect(observed).toEqual(
      declared.map((edge) => ({
        relationship: (edge as { kind: string }).kind,
        from: "orders.handle",
        to: (edge as { to: string }).to,
      })),
    );
    expect(operations).toEqual([
      {
        capability: "buckets",
        operation: "put",
        ownerId: "orders.handle",
        bucketId: "orders.files",
        outcome: "success",
      },
      {
        capability: "cache",
        operation: "get",
        ownerId: "orders.handle",
        cacheId: "orders.prices",
        outcome: "success",
      },
    ]);
  });

  test("installs the guarded clients inside the active invocation bridge", async () => {
    let bridgeRuns = 0;
    const declared: unknown[] = [];
    const observed: unknown[] = [];
    const runner: InvocationRunner = {
      run: (effect, options) => {
        bridgeRuns += 1;
        return Effect.runPromise(effect, options);
      },
    };
    const target: InvocationTarget<unknown, { readonly ok: true }, InvocationContext> = {
      id: "orders.handle",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      dependencies: { jobs: { send: ref("job", "orders.send") } },
      handler: async (_input, context) => {
        const clients = context as unknown as {
          readonly jobs: { readonly send: { enqueue: (input: unknown) => Promise<unknown> } };
        };
        await clients.jobs.send.enqueue({});
        expect(() => (context.jobs as Record<string, unknown>).missing).toThrow(
          DependencyAccessError,
        );
        return { ok: true };
      },
    };

    await invokeFunction(
      target,
      {},
      {
        effectRunner: runner,
        clients: { jobs: { "orders.send": { enqueue: async () => ({}) } } },
        hooks: {
          onDeclaredEdge: (edge) => declared.push(edge),
          onObservedEdge: (edge) => observed.push(edge),
        },
      },
    );

    expect(bridgeRuns).toBeGreaterThan(1);
    expect(declared).toEqual([{ kind: "enqueues-job", from: "orders.handle", to: "orders.send" }]);
    expect(observed).toEqual([
      { relationship: "enqueues-job", from: "orders.handle", to: "orders.send" },
    ]);
  });

  test("routes declared agents to their generated function and agent edge", async () => {
    const calls: unknown[] = [];
    const observed: unknown[] = [];
    const clients = buildDependencyClients({
      ownerId: "orders.handle",
      dependencies: { agents: { support: ref("agent", "orders.support") } },
      sources: { agents: { "orders.support": async () => ({ answer: "ok" }) } },
      invokeFunction: async (request) => {
        calls.push(request);
        return { answer: "ok" };
      },
      onObservedEdge: (edge) => observed.push(edge),
    });

    await (clients.agents.support as (input: unknown) => Promise<unknown>)({ question: "status" });
    expect(calls).toEqual([
      expect.objectContaining({
        functionId: "relkit.agent.orders.support.invoke",
        declaration: ref("agent", "orders.support"),
      }),
    ]);
    expect(observed).toEqual([
      { relationship: "invokes-agent", from: "orders.handle", to: "orders.support" },
    ]);
  });
});
