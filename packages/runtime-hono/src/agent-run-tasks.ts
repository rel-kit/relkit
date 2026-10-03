import type { Runtime } from "./agent-run-tasks.types.js";
import { Context, Effect, Fiber, FiberMap, Layer, ManagedRuntime } from "effect";
import { withNativeEffectContext } from "@relkit/runtime-effect";
import { httpBoundary, observeHttp } from "./http-effect.js";
import { currentHttpContextLayer } from "./http-logging.js";

/** Generation-owned accepted runs. Request cancellation never closes this service.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { AgentRunTasks, AgentRunTasksLive } from "./agent-run-tasks.js";
 * const program = Effect.gen(function* () {
 *   const tasks = yield* AgentRunTasks;
 *   let completed = 0;
 *   yield* tasks.start("example", Effect.sync(() => { completed++; }));
 *   return completed;
 * }).pipe(Effect.provide(AgentRunTasksLive));
 * ```
 * @see tests/agent-services.examples.test.ts for the checked example.
 */
export class AgentRunTasks extends Context.Service<
  AgentRunTasks,
  {
    readonly start: (runId: string, task: Effect.Effect<void, unknown>) => Effect.Effect<void>;
  }
>()("@relkit/runtime-hono/AgentRunTasks") {}

/** Owns and joins every accepted run when its generation is disposed. */
export const AgentRunTasksLive = Layer.effect(
  AgentRunTasks,
  Effect.gen(function* () {
    const fibers = yield* FiberMap.make<string, void, unknown>();
    return {
      start: Effect.fn("AgentRunTasks.start")(function* (
        runId: string,
        task: Effect.Effect<void, unknown>,
      ) {
        const fiber = yield* FiberMap.run(fibers, runId, task, { onlyIfMissing: true });
        yield* Fiber.await(fiber);
      }),
    };
  }),
);
const generations = new WeakMap<object, Runtime>();
// This index only locates a generation's join operation; the layer owns work.
const tasks = new Map<string, Promise<void>>();

/** Starts a run once within its generation and joins durable settlement on shutdown.
 * @param runId - Stable run identifier within the owning generation or provider scope.
 * @param start - Lazy native task started only after generation ownership is established.
 * @param owner - Object identifying the generation that owns accepted work.
 * @param generationSignal - Generation retirement signal; request disconnects must not use it.
 * @returns The shared Promise joining accepted execution and durable finalization.
 */
export function trackAgentRun(
  runId: string,
  start: () => Promise<void>,
  owner: object,
  generationSignal?: AbortSignal,
): Promise<void> {
  const existing = tasks.get(runId);
  if (existing !== undefined) return existing;
  let runtime = generations.get(owner);
  if (runtime === undefined) {
    runtime = ManagedRuntime.make(Layer.merge(AgentRunTasksLive, currentHttpContextLayer()));
    generations.set(owner, runtime);
    const current = runtime;
    /** Disposes the generation runtime and interrupts its owned run fibers.
     * @returns Nothing; the runtime disposal joins owned finalizers asynchronously.
     */
    const close = (): void => {
      void current.dispose();
    };
    if (generationSignal?.aborted) close();
    else generationSignal?.addEventListener("abort", close, { once: true });
  }
  const execute = Effect.acquireUseRelease(
    Effect.withFiber((fiber) => Effect.sync(() => withNativeEffectContext(fiber.context, start))),
    (task) => httpBoundary("agent.run", () => task),
    (task) => Effect.promise(() => task.catch(() => undefined)),
  );
  const task = runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* AgentRunTasks;
      yield* service.start(runId, observeHttp("agent.run", execute));
    }),
  );
  tasks.set(runId, task);
  /** Removes only this completed task from the run join index.
   * @returns Nothing; a newer task with the same run ID remains indexed.
   */
  const done = (): void => {
    if (tasks.get(runId) === task) tasks.delete(runId);
  };
  void task.then(done, done);
  return task;
}

/** Joins an accepted run without taking ownership of it.
 * @param runId - Stable run identifier within the owning generation or provider scope.
 * @returns Completion of the currently tracked run, or immediate completion when none exists.
 */
export async function waitForAgentRun(runId: string): Promise<void> {
  await tasks.get(runId);
}
