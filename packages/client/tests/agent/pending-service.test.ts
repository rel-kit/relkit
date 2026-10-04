import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { PendingOperations, pendingOperationsLayer } from "../../src/react/pending.service.js";
import { PendingCapacityError } from "../../src/react/pending-errors.js";
import { AgentOperations, AgentOperationsLive } from "../../src/react/agent-operations.service.js";
import type { PendingOperationMetadata } from "@relkit/contracts";

it.effect("simultaneous hashes cannot exceed capacity or persist transmitted inputs", () =>
  Effect.gen(function* () {
    const service = yield* PendingOperations;
    const results = yield* Effect.forEach(
      Array.from({ length: 101 }, (_, index) => index),
      (index) =>
        Effect.exit(
          service.remember(
            "capacity",
            "job-trigger",
            "job",
            { private: index },
            {},
            { operationId: `intent-${index}`, retainRequest: true },
          ),
        ),
      { concurrency: "unbounded" },
    );
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(100);
    const failure = results.find((result) => result._tag === "Failure");
    expect(failure?._tag).toBe("Failure");
    const entries = yield* service.list("capacity");
    expect(entries).toHaveLength(100);
    expect(JSON.stringify(entries)).not.toContain("private");
    const entry = entries[0]!;
    expect(yield* service.request("capacity", entry.operationId)).toMatchObject({
      private: expect.any(Number),
    });
    const repeated = yield* Effect.exit(
      service.remember("capacity", "job-trigger", "job", {}, {}, { operationId: "intent-102" }),
    );
    expect(repeated._tag).toBe("Failure");
    if (repeated._tag === "Failure")
      expect(
        repeated.cause.reasons[0]?._tag === "Fail" && repeated.cause.reasons[0].error,
      ).toBeInstanceOf(PendingCapacityError);
  }).pipe(Effect.provide(pendingOperationsLayer(new Map()))),
);

const agentPending = pendingOperationsLayer(new Map());

it.effect("standalone continuation interruption aborts its authoritative native read", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let request: AbortSignal | undefined;
    let cancelled = 0;
    const agent = yield* AgentOperations;
    const client = {
      "relkit.agent.load": (_input: unknown, options: { signal: AbortSignal }) => {
        request = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => {
              cancelled++;
              reject(options.signal.reason);
            },
            { once: true },
          );
          Effect.runSync(Deferred.succeed(started, undefined));
        });
      },
    };
    const work = yield* Effect.forkChild(agent.continuation(client, "agent", "thread", {}));
    yield* Deferred.await(started);
    yield* Fiber.interrupt(work);
    expect(request?.aborted).toBe(true);
    expect(cancelled).toBe(1);
  }).pipe(
    Effect.provide(AgentOperationsLive.pipe(Layer.provide(pendingOperationsLayer(new Map())))),
  ),
);

it.effect("agent dispatch retains unknown receipt authority and the original rejection", () =>
  Effect.gen(function* () {
    const agent = yield* AgentOperations;
    const pending = yield* PendingOperations;
    const rejection = { code: "transport-lost" };
    const result = yield* Effect.exit(
      agent.submit({
        client: {
          "relkit.agent.run": async () => {
            throw rejection;
          },
        },
        scopeKey: "agent-owner",
        agentId: "agent",
        threadId: "thread",
        identity: undefined,
        kind: "run",
        payload: { secret: "memory-only" },
      }),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure")
      expect(result.cause.reasons[0]?._tag === "Fail" && result.cause.reasons[0].error).toBe(
        rejection,
      );
    const entries: readonly PendingOperationMetadata[] = yield* pending.list("agent-owner");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.state).toBe("unknown");
    expect(yield* pending.request("agent-owner", entries[0]!.operationId)).toBeUndefined();
    expect(JSON.stringify(entries)).not.toContain("memory-only");
  }).pipe(
    Effect.provide(
      Layer.mergeAll(AgentOperationsLive.pipe(Layer.provide(agentPending)), agentPending),
    ),
  ),
);
