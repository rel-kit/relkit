import { expect, it } from "@effect/vitest";
import type { RegistrationPlan } from "@relkit/graph";
import { defineTask, encodeJobWire } from "@relkit/jobs";
import { z } from "@relkit/schema";
import { Effect, Layer } from "effect";
import {
  EventMaterializationLive,
  EventMaterializationService,
  JobMaterializationLive,
  JobMaterializationService,
  TaskExecutionLive,
  TaskExecutionService,
} from "../src/execution.service.js";
import { DependencyLive, DependencyService } from "../src/registry.service.js";

const plan: RegistrationPlan = {
  graphHash: "sha256:empty",
  functions: [],
  httpTriggers: [],
  queues: [],
  schedules: [],
  eventTriggers: [],
  buckets: [],
  caches: [],
  tools: [],
  agents: [],
  channels: [],
  middlewares: [],
};
const engine = { invoke: async () => undefined };

it.effect("composes live event and job services with explicit native dependencies", () =>
  Effect.gen(function* () {
    const events = yield* (yield* EventMaterializationService).materialize({ plan, engine });
    const jobs = yield* (yield* JobMaterializationService).materialize({ plan, engine });
    expect(events.triggers.size).toBe(0);
    expect(jobs.jobs.size).toBe(0);
    expect(yield* Effect.promise(() => jobs.runDue())).toEqual([]);
  }).pipe(Effect.provide(Layer.mergeAll(EventMaterializationLive, JobMaterializationLive))),
);

it.effect("substitutes event materialization at the service boundary", () =>
  Effect.gen(function* () {
    const unavailable = new Error("test provider unavailable");
    const consume = Effect.gen(function* () {
      return yield* (yield* EventMaterializationService).materialize({ plan, engine });
    });
    const outcome = yield* consume.pipe(
      Effect.provide(
        Layer.succeed(EventMaterializationService, { materialize: () => Effect.fail(unavailable) }),
      ),
      Effect.result,
    );
    expect(outcome._tag).toBe("Failure");
    if (outcome._tag === "Failure") expect(outcome.failure).toBe(unavailable);
  }),
);

it.effect("constructs guarded clients through the dependency service", () =>
  Effect.gen(function* () {
    const clients = yield* (yield* DependencyService).clients({ ownerId: "orders.test" });
    expect(Object.keys(clients.cache)).toEqual([]);
    expect(() => clients.cache.undeclared).toThrow();
  }).pipe(Effect.provide(DependencyLive)),
);

it.effect("executes a verified native envelope through the task service", () =>
  Effect.gen(function* () {
    const task = defineTask({
      id: "orders.echo",
      version: "1",
      input: z.number(),
      output: z.number(),
      handler: async (input) => input + 1,
    });
    const envelope = {
      runId: "run.test",
      jobId: "orders.job",
      taskId: task.id,
      taskVersion: task.version,
      buildId: "build.test",
      input: encodeJobWire(4),
    };
    const value = yield* (yield* TaskExecutionService).execute(
      envelope,
      { run: envelope, signal: new AbortController().signal },
      { tasks: { [task.id]: task } },
    );
    expect(value).toBe(5);
  }).pipe(Effect.provide(TaskExecutionLive)),
);
