import { Context, Effect, Layer } from "effect";
import type {
  EventMaterializationOperations,
  JobMaterializationOperations,
  TaskExecutionOperations,
} from "./execution.service.types.js";
import { materializeEventsEffect } from "./materialize-events.js";
import { materializeJobsEffect } from "./materialize-jobs.js";
import { executeTaskEffect } from "./task-executor.js";

/** Event registration authority with replaceable provider dependencies.
 * @example
 * ```ts
 * const register = (options: EventMaterializationOptions) => Effect.runPromise(
 *   Effect.gen(function* () {
 *     return yield* (yield* EventMaterializationService).materialize(options);
 *   }).pipe(Effect.provide(EventMaterializationLive)));
 * ```
 * @remarks The live-layer composition is checked in tests/domain-layers.test.ts;
 * replace the layer with Layer.succeed using the same operations contract in tests.
 */
export class EventMaterializationService extends Context.Service<
  EventMaterializationService,
  EventMaterializationOperations
>()("@relkit/engine/Events") {}

/** Legacy job queue/schedule binding authority.
 * @example
 * ```ts
 * const register = (options: JobMaterializationOptions) => Effect.runPromise(
 *   Effect.gen(function* () {
 *     return yield* (yield* JobMaterializationService).materialize(options);
 *   }).pipe(Effect.provide(JobMaterializationLive)));
 * ```
 * @remarks Queues and schedules stay provider-owned. The live layer and empty-plan
 * result are checked in tests/domain-layers.test.ts.
 */
export class JobMaterializationService extends Context.Service<
  JobMaterializationService,
  JobMaterializationOperations
>()("@relkit/engine/Jobs") {}

/** Native task envelope and execution authority.
 * @example
 * ```ts
 * const execute = (envelope: TaskExecutionEnvelope, binding: TaskExecutionBinding,
 *   options: TaskExecutorOptions) => Effect.runPromise(Effect.gen(function* () {
 *     return yield* (yield* TaskExecutionService).execute(envelope, binding, options);
 *   }).pipe(Effect.provide(TaskExecutionLive)));
 * ```
 * @remarks The native envelope example is checked in tests/domain-layers.test.ts.
 * Provider continuation values retain their nonterminal suspension behavior.
 */
export class TaskExecutionService extends Context.Service<
  TaskExecutionService,
  TaskExecutionOperations
>()("@relkit/engine/Tasks") {}

/** Live event registration operations; provider calls remain sequential. */
export const EventMaterializationLive = Layer.effect(
  EventMaterializationService,
  Effect.gen(function* () {
    return EventMaterializationService.of({ materialize: materializeEventsEffect });
  }),
);

/** Live legacy job operations; queues retain authoritative retry state. */
export const JobMaterializationLive = Layer.effect(
  JobMaterializationService,
  Effect.gen(function* () {
    return JobMaterializationService.of({ materialize: materializeJobsEffect });
  }),
);

/** Live task operations; durable suspension remains nonterminal control flow. */
export const TaskExecutionLive = Layer.effect(
  TaskExecutionService,
  Effect.gen(function* () {
    return TaskExecutionService.of({ execute: executeTaskEffect });
  }),
);
