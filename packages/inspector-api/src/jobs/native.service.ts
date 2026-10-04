import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { inspectorLoggerLayer } from "../execution.js";
import { nativeAttempt, unwrapInspectorFailure } from "../native-edge.js";
import type { ResolvedActiveGeneration } from "../shared.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { checkpoint, runKey, type AggregatePosition } from "./run-aggregate-support.js";
import { nativeRunFilters, type InspectorRunFilters } from "./filters.js";
import { operationContext } from "./services.js";
import type { SchedulePosition } from "./schedules.js";
import type {
  InspectorNativeJobsService,
  NativeRunPage,
  NativeSchedulePage,
  NativeHealthPage,
} from "./native.types.js";

/** Ordered, bounded native job reads with explicit fatal/partial failure policy. */
export class InspectorNativeJobs extends Context.Service<
  InspectorNativeJobs,
  InspectorNativeJobsService
>()("@relkit/inspector/NativeJobs") {}

/**
 * Provides native traversal operations without workers or retained native resources.
 * @returns A live layer; callers can substitute the same contract in test layers.
 * @remarks Native methods receive the HTTP signal. Cursor violations fail the whole
 * operation; an unavailable service contributes a partial checkpoint and no exact count.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { InspectorNativeJobs, inspectorNativeJobsLayer } from "@relkit/inspector-api";
 * const health = Effect.flatMap(InspectorNativeJobs, (jobs) => jobs.healthPages([]));
 * await Effect.runPromise(health.pipe(Effect.provide(inspectorNativeJobsLayer)));
 * ```
 */
export const inspectorNativeJobsLayer = Layer.effect(
  InspectorNativeJobs,
  Effect.sync(() => InspectorNativeJobs.of({ runPages, schedulePages, healthPages })),
);

/** Compatibility owner reused by standalone native-job calls. */
export const inspectorNativeJobsExecution = ManagedRuntime.make(
  Layer.mergeAll(inspectorNativeJobsLayer, inspectorLoggerLayer()),
);

/**
 * Reads native run pages concurrently while retaining binding order.
 * @param generation - Authorized generation and configured concurrency bound.
 * @param request - HTTP request whose signal reaches each native operation.
 * @param filters - Validated run filters.
 * @param bindings - Ordered selected native authorities.
 * @param position - Signed aggregate checkpoint for each selected service.
 * @returns Ordered pages, or a fatal public cursor error.
 */
const runPages = Effect.fn("InspectorNativeJobs.runPages")(
  (
    generation: ResolvedActiveGeneration,
    request: Request,
    filters: InspectorRunFilters,
    bindings: readonly InspectorJobsBinding[],
    position: AggregatePosition,
  ) =>
    Effect.forEach(
      bindings,
      (binding) =>
        Effect.gen(function* () {
          const state =
            position.services.find((entry) => entry.service === binding.service) ??
            checkpoint(binding);
          if (state.blocked || state.exhausted) return { binding, state } satisfies NativeRunPage;
          const result = yield* nativeAttempt(() =>
            binding.list(
              {
                ...nativeRunFilters(filters),
                limit: Math.max(filters.limit ?? 25, 25),
                ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
              },
              operationContext(generation, binding, "read", request),
            ),
          ).pipe(
            Effect.matchEffect({
              onSuccess: (page) => Effect.succeed({ page }),
              onFailure: (error) => {
                const original = unwrapInspectorFailure(error);
                return original instanceof InspectorJobsError
                  ? Effect.fail(original)
                  : Effect.as(Effect.logWarning("Inspector native jobs service unavailable"), {
                      page: undefined,
                    });
              },
            }),
          );
          const page = result.page;
          if (page === undefined)
            return {
              binding,
              state: { ...state, blocked: true },
              reason: "native service unavailable",
            } satisfies NativeRunPage;
          if (
            (page.hasMore && page.nextCursor === undefined) ||
            (page.hasMore && state.cursor !== undefined && page.nextCursor === state.cursor) ||
            state.consumed.some((key) => !page.items.some((run) => runKey(run, binding) === key))
          )
            return yield* Effect.fail(
              new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400),
            );
          const unavailable = page.availability.find((entry) => entry.state === "unavailable");
          return unavailable === undefined
            ? { binding, page, state }
            : {
                binding,
                page,
                state: { ...state, blocked: true },
                reason: unavailable.reason ?? "native service unavailable",
              };
        }),
      { concurrency: readConcurrency(generation, bindings.length) },
    ),
  (effect, _generation, _request, _filters, bindings) =>
    observeExecution("inspector", "jobs.run-pages", effect, () => ({ services: bindings.length })),
);

/**
 * Reads schedule pages with the same finite ordered concurrency policy as runs.
 * @param generation - Authorized native job generation.
 * @param request - Request whose signal reaches each native method.
 * @param limit - Validated per-service page limit.
 * @param bindings - Ordered selected native authorities.
 * @param position - Signed continuation checkpoints.
 * @returns Ordered receipts; unsupported or failed providers remain unavailable.
 */
const schedulePages = Effect.fn("InspectorNativeJobs.schedulePages")(
  (
    generation: ResolvedActiveGeneration,
    request: Request,
    limit: number,
    bindings: readonly InspectorJobsBinding[],
    position: SchedulePosition,
  ) =>
    Effect.forEach(
      bindings,
      (binding) =>
        Effect.gen(function* () {
          const checkpoint = position[binding.service];
          if (checkpoint?.state === "exhausted" || checkpoint?.state === "unavailable")
            return { binding, checkpoint } satisfies NativeSchedulePage;
          const schedules = binding.schedules;
          if (schedules === undefined)
            return {
              binding,
              checkpoint: { state: "unavailable", reason: "schedules unsupported" },
            } satisfies NativeSchedulePage;
          return yield* nativeAttempt(() =>
            schedules.list(
              { limit, ...(checkpoint?.cursor === undefined ? {} : { cursor: checkpoint.cursor }) },
              operationContext(generation, binding, "schedule", request),
            ),
          ).pipe(
            Effect.matchEffect({
              onSuccess: (receipt) =>
                Effect.succeed({ binding, receipt, checkpoint: { state: "active" as const } }),
              onFailure: () =>
                Effect.as(Effect.logWarning("Inspector native schedules service unavailable"), {
                  binding,
                  checkpoint: {
                    state: "unavailable" as const,
                    reason: "native service unavailable",
                  },
                }),
            }),
          );
        }),
      { concurrency: readConcurrency(generation, bindings.length) },
    ),
  (effect, _generation, _request, _limit, bindings) =>
    observeExecution("inspector", "jobs.schedule-pages", effect, () => ({
      services: bindings.length,
    })),
);

/**
 * Clamps native read concurrency to the finite selected binding count.
 * @param generation - Generation supplying the optional configured bound.
 * @param size - Selected binding count.
 * @returns A positive finite concurrency bound.
 */
function readConcurrency(generation: ResolvedActiveGeneration, size: number): number {
  const requested = generation.jobs?.maxReadConcurrency ?? 4;
  return Math.max(1, Math.min(Number.isFinite(requested) ? Math.floor(requested) : 4, size || 1));
}

/**
 * Reads independent native health authorities with finite ordered traversal.
 * @param bindings - Ordered authorities selected by the caller.
 * @param concurrency - Optional configured bound; defaults to four reads.
 * @returns Ordered health evidence; failures become explicit unavailability.
 */
const healthPages = Effect.fn("InspectorNativeJobs.healthPages")(
  (bindings: readonly InspectorJobsBinding[], concurrency = 4) =>
    Effect.forEach(
      bindings,
      (binding) => {
        const health = binding.health;
        return health === undefined
          ? Effect.succeed({
              binding,
              health: { state: "unknown" },
              available: true,
            } satisfies NativeHealthPage)
          : nativeAttempt(() => health.call(binding)).pipe(
              Effect.matchEffect({
                onSuccess: (health) =>
                  Effect.succeed({ binding, health, available: true } satisfies NativeHealthPage),
                onFailure: () =>
                  Effect.as(Effect.logWarning("Inspector native health service unavailable"), {
                    binding,
                    health: { state: "unavailable" },
                    available: false,
                  } satisfies NativeHealthPage),
              }),
            );
      },
      {
        concurrency: Math.max(
          1,
          Math.min(
            Number.isFinite(concurrency) ? Math.floor(concurrency) : 4,
            bindings.length || 1,
          ),
        ),
      },
    ),
  (effect, bindings) =>
    observeExecution("inspector", "jobs.health-pages", effect, () => ({
      services: bindings.length,
    })),
);
