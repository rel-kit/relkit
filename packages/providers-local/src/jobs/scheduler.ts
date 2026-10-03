import { compileSchedule, ScheduleValidationError, validDate } from "./schedule-definition.js";
import { nativeNow } from "../native-services.js";
import type {
  CompiledSchedule,
  ScheduleEnqueueContext,
  ScheduleEnqueue,
  SchedulerRegistration,
  SchedulerClock,
  SchedulerOptions,
  ScheduleRun,
  ScheduleState,
  Scheduler,
  SchedulerEffects,
} from "./scheduler.types.js";
import { Context, Effect, Layer, Ref } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  runLocal,
  runLocalSync,
  type LocalOperationError,
} from "../local-effect.js";
import { normalizeId } from "@relkit/contracts";
import type { ScheduleDefinition } from "@relkit/jobs/legacy";

export { compileSchedule, ScheduleValidationError } from "./schedule-definition.js";
export type {
  CompiledSchedule,
  ScheduleEnqueueContext,
  ScheduleEnqueue,
  SchedulerRegistration,
  SchedulerClock,
  SchedulerOptions,
  ScheduleRun,
  Scheduler,
} from "./scheduler.types.js";

/** Runs due schedules against an injected clock without owning or calling handlers.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The synchronous registration and Promise execution compatibility interface.
 */
export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  const service = runLocalSync(makeSchedulerService(options));
  return Object.freeze({
    register: (schedule: ScheduleDefinition, enqueue: ScheduleEnqueue) =>
      runLocalSync(service.register(schedule, enqueue)),
    nextFire: (scheduleId: string) => runLocalSync(service.nextFire(scheduleId)),
    runDue: (currentDate?: Date | number) => runLocal(service.runDue(currentDate)),
    tick: (currentDate?: Date | number) => runLocal(service.tick(currentDate)),
  });
}

/** Owns schedule registrations, next-fire positions and active overlap counters. */
export class LocalSchedulerService extends Context.Service<
  LocalSchedulerService,
  SchedulerEffects
>()("@relkit/providers-local/Scheduler") {}

/** Provides an explicitly driven scheduler without starting an automatic timer.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The live scheduler layer without automatic background timers.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalSchedulerService, schedulerLayer } from "./scheduler.js";
 *
 * const program = Effect.gen(function* () {
 *   const scheduler = yield* LocalSchedulerService;
 *     return yield* scheduler.runDue();
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(schedulerLayer())));
 * ```
 */
export function schedulerLayer(options: SchedulerOptions = {}) {
  return Layer.effect(LocalSchedulerService, makeSchedulerService(options));
}

/**
 * Creates lazy registration, inspection and due-work operations over one owned state.
 * @param options - Explicit clock and initial schedule registrations.
 * @returns The service; independent enqueue calls retain the existing overlap semantics.
 */
export const makeSchedulerService = Effect.fn("Scheduler.create")(function* (
  options: SchedulerOptions = {},
) {
  const readClock = options.clock?.now ?? options.now ?? (() => new Date(nativeNow()));
  const stateRef = yield* Ref.make(new Map<string, ScheduleState>());
  const states = Ref.getUnsafe(stateRef);

  /**
   * Validates and registers a schedule with its enqueue target and next occurrence.
   * @param schedule - Declared cron schedule.
   * @param enqueue - Native callback accepting a due occurrence.
   * @returns The compiled schedule after registration.
   */
  const register = (schedule: ScheduleDefinition, enqueue: ScheduleEnqueue): CompiledSchedule => {
    if (typeof enqueue !== "function") throw new TypeError("Schedule enqueue target is required");
    const compiled = compileSchedule(schedule, { currentDate: readDate(readClock()) });
    if (states.has(compiled.id))
      throw new ScheduleValidationError(`Duplicate schedule "${compiled.id}"`);
    states.set(compiled.id, {
      compiled,
      enqueue,
      nextFireAt: compiled.nextFireAt.getTime(),
      active: 0,
    });
    return compiled;
  };

  for (const registration of options.schedules ?? [])
    yield* localSync(() => register(registration.schedule, registration.enqueue));

  /**
   * Reads the next occurrence of a registered schedule.
   * @param scheduleId - Registered schedule identity.
   * @returns A copied date or undefined for an unknown schedule.
   */
  const nextFire = (scheduleId: string): Date | undefined => {
    const state = states.get(normalizeId(scheduleId));
    return state === undefined ? undefined : new Date(state.nextFireAt);
  };

  /**
   * Advances due occurrences and runs admitted enqueue callbacks with overlap tracking.
   * @param currentDate - Explicit clock override for this scheduler tick.
   * @returns A lazy effect yielding ordered enqueue and skip outcomes.
   */
  const runDueEffect = Effect.fn("Scheduler.runDue")(function* (currentDate?: Date | number) {
    const now = yield* localSync(() => readDate(currentDate ?? readClock()).getTime());
    const runs: Effect.Effect<ScheduleRun, LocalOperationError>[] = [];
    for (const state of [...states.values()].sort((a, b) =>
      a.compiled.id.localeCompare(b.compiled.id),
    )) {
      while (state.nextFireAt <= now) {
        const fireAt = new Date(state.nextFireAt);
        state.nextFireAt = state.compiled.nextFire(fireAt).getTime();
        if (state.compiled.overlap === "skip" && state.active > 0) {
          runs.push(Effect.succeed({ scheduleId: state.compiled.id, fireAt, status: "skipped" }));
          continue;
        }
        state.active += 1;
        runs.push(
          localPromise(async () =>
            state.enqueue(state.compiled.input, { scheduleId: state.compiled.id, fireAt }),
          ).pipe(
            Effect.map((result) => ({
              scheduleId: state.compiled.id,
              fireAt,
              status: "enqueued" as const,
              result,
            })),
            Effect.ensuring(
              Effect.sync(() => {
                state.active -= 1;
              }),
            ),
            Effect.uninterruptible,
          ),
        );
      }
    }
    return yield* Effect.all(runs, { concurrency: "unbounded" });
  });
  /**
   * Exposes the scheduler due-work operation through its owning instrumentation.
   * @param currentDate - Explicit clock override for this scheduler tick.
   * @returns The lazy effect yielding the due occurrence outcomes.
   */
  const runDue = (currentDate?: Date | number) =>
    localOperation("Scheduler.runDue", runDueEffect(currentDate));

  return LocalSchedulerService.of({
    register: (schedule, enqueue) =>
      localOperation(
        "Scheduler.register",
        localSync(() => register(schedule, enqueue)),
      ),
    nextFire: (scheduleId) =>
      localOperation(
        "Scheduler.nextFire",
        localSync(() => nextFire(scheduleId)),
      ),
    runDue,
    tick: runDue,
  });
});

/** Reads and validates the scheduler clock value.
 * @param value - Value to validate, normalize or project.
 * @returns The validated clock date.
 */
function readDate(value: Date | number): Date {
  return validDate(typeof value === "number" ? new Date(value) : value, "clock date");
}
