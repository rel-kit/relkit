import { join } from "node:path";
import { Context, Effect, Layer, Ref, Semaphore } from "effect";
import type { JsonValue } from "@relkit/contracts";
import type {
  LegacyJobEffects,
  ObservabilityEffects,
} from "./runtime-capabilities.service.types.js";
import { localOperation, localPromise } from "./local-effect.js";
import { createJobQueue } from "./jobs/queue.js";
import { createJobStore, type JobStore } from "./jobs/store.js";

/** Legacy queue acquisition and journal lifecycle owned by one local profile. */
export class LocalLegacyJobService extends Context.Service<
  LocalLegacyJobService,
  LegacyJobEffects
>()("@relkit/providers-local/LegacyJobs") {}

/** In-memory observability collection; records remain caller-owned JSON values. */
export class LocalObservabilityService extends Context.Service<
  LocalObservabilityService,
  ObservabilityEffects
>()("@relkit/providers-local/Observability") {}

/**
 * Shares journal acquisition across concurrent queue requests and serializes close.
 * @param root - Owned local state directory.
 * @param profile - Job profile partition.
 * @returns A lazy queue lifecycle owner preserving legacy queue semantics.
 */
export const makeLegacyJobService = Effect.fn("LegacyJobs.create")(function* (
  root: string,
  profile: string,
) {
  const stores = yield* Ref.make(new Map<string, JobStore>());
  const gate = yield* Semaphore.make(1);
  return LocalLegacyJobService.of({
    createQueue: Effect.fn("LegacyJobs.createQueue")((context) =>
      localOperation(
        "LegacyJobs.createQueue",
        gate.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* Ref.get(stores);
            const store =
              current.get(context.jobId) ??
              (yield* localPromise(() =>
                createJobStore(join(root, "jobs", profile, context.jobId)),
              ));
            current.set(context.jobId, store);
            return createJobQueue(store, {
              ...(context.idempotency === undefined ? {} : { idempotency: context.idempotency }),
            });
          }).pipe(Effect.uninterruptible),
        ),
      ),
    ),
    close: Effect.fn("LegacyJobs.close")(() =>
      localOperation(
        "LegacyJobs.close",
        gate.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* Ref.get(stores);
            yield* Effect.forEach(current.values(), (store) => localPromise(() => store.close()), {
              concurrency: 8,
              discard: true,
            });
          }),
        ),
      ),
    ),
  });
});

/** Supplies and finalizes a legacy job profile using the same service contract as tests.
 * @param root - Owned state directory.
 * @param profile - Local provider profile partition.
 * @returns The scoped legacy-job service layer.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalLegacyJobService, legacyJobLayer } from "./runtime-capabilities.service.js";
 *
 * const program = Effect.gen(function* () {
 *   const jobs = yield* LocalLegacyJobService;
 *     return yield* jobs.createQueue({ jobId: "example" });
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(legacyJobLayer("/tmp/example-legacy", "demo"))));
 * ```
 */
export function legacyJobLayer(root: string, profile: string) {
  return Layer.effect(
    LocalLegacyJobService,
    Effect.acquireRelease(makeLegacyJobService(root, profile), (service) =>
      service.close().pipe(Effect.orDie),
    ),
  );
}

/** Constructs lazy synchronous record collection without recursively instrumenting the log sink. */
export const makeObservabilityService = Effect.gen(function* () {
  const records = yield* Ref.make<JsonValue[]>([]);
  return LocalObservabilityService.of({
    collect: (record) =>
      Ref.update(records, (current) => {
        current.push(record);
        return current;
      }),
    read: () => Effect.map(Ref.get(records), (current) => Object.freeze([...current])),
  });
});

/** Provides one isolated in-memory collection per layer acquisition. */
export const localObservabilityLayer = Layer.effect(
  LocalObservabilityService,
  makeObservabilityService,
);
