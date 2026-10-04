import { Deferred, Effect, Ref } from "effect";
import { closeAction, resourceAction } from "./drain-cleanup.js";
import { drainReport } from "./drain-report.js";
import type { DrainRunOptions } from "./drain-service.types.js";
import type {
  SupervisorDrainFailure,
  SupervisorDrainOptions,
  SupervisorDrainResourceResult,
} from "./drain.types.js";

/**
 * Closes admission and waits/cleans resources under one absolute deadline.
 * @param dependencies - Owned state, identity and injected clock.
 * @param options - Native candidate, provider owners and isolated report callback.
 * @returns Immutable evidence; a timeout does not pretend native process exit occurred.
 */
export const runDrain = Effect.fn("SupervisorDrain.run")(function* (
  dependencies: DrainRunOptions,
  options: SupervisorDrainOptions,
) {
  const { state, now, deadlineMs, token } = dependencies;
  const initial = yield* Ref.modify(state, (current) => [
    current,
    { ...current, accepting: false },
  ]);
  const started = yield* now;
  const deadline = started + deadlineMs;
  const idle =
    initial.work.size === 0
      ? true
      : yield* Effect.raceFirst(
          Deferred.await(initial.idle).pipe(Effect.as(true)),
          Effect.sleep(Math.max(0, deadline - (yield* now))).pipe(Effect.as(false)),
        );
  let interrupted = 0;
  if (!idle) {
    const pending = [...Ref.getUnsafe(state).work.values()];
    for (const work of pending) {
      if (work.controller.signal.aborted) continue;
      work.controller.abort(new Error("Retired generation drain deadline expired."));
      interrupted++;
    }
    // Native callbacks are best effort, but their waiters are owned and joined.
    yield* Effect.forEach(
      pending,
      (work) =>
        closeAction(
          "interruption",
          work.interrupt === undefined
            ? undefined
            : () => work.interrupt?.("Retired generation drain deadline expired."),
          deadline,
          now,
        ),
      { concurrency: 32, discard: true },
    );
  }
  const candidate = yield* closeAction("candidate", options.candidate?.dispose, deadline, now);
  const providers: SupervisorDrainResourceResult[] = [];
  const failures: SupervisorDrainFailure[] = [];
  const ownedProviders = options.providers ?? [];
  for (let index = ownedProviders.length - 1; index >= 0; index--) {
    const provider = ownedProviders[index];
    if (provider === undefined) continue;
    const id = provider.id ?? `provider-${index}`;
    const result = yield* closeAction(id, resourceAction(provider), deadline, now);
    providers.push({ id, status: result.status });
    if (result.message !== undefined) failures.push({ resource: id, message: result.message });
  }
  if (candidate.message !== undefined)
    failures.push({ resource: "candidate", message: candidate.message });
  const report = drainReport(
    token,
    deadlineMs,
    (yield* now) - started,
    initial.work.size,
    Ref.getUnsafe(state).work.size,
    interrupted,
    !idle,
    candidate,
    providers,
    failures,
  );
  yield* Effect.sync(() => {
    try {
      options.onReport?.(report);
    } catch {
      /* Best effort observer. */
    }
  });
  return report;
});
