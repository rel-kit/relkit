import { observeCompiler } from "../observability.js";
import { Cause, Effect, Exit, Schema } from "effect";
import { installFileDetectorsEffect } from "./evaluator-detector-files.js";
import { installNetworkDetectorsEffect } from "./evaluator-detector-network.js";
import { installOutputEffect, installTimersEffect } from "./evaluator-detector-timers.js";
import { EvaluatorSideEffect } from "./evaluator-protocol-schema.js";
import { runDiscoverySync } from "./discovery-sync.js";
import type { EvaluatorSideEffectKind } from "./evaluator-protocol.js";
import type { Restore, Violate } from "./evaluator-detector-native.types.js";
import type { TimerRecord } from "./evaluator-detector-timers.types.js";
import type {
  EvaluatorDetectorOptions as Options,
  EvaluatorDetectorSession,
} from "./evaluator-detectors.types.js";
export type {
  EvaluatorDetectorOptions,
  EvaluatorDetectorReport,
  EvaluatorDetectorSession,
} from "./evaluator-detectors.types.js";

/** Authoritative candidate sandbox settings. */
export const EvaluatorDetectorOptionsSchema = Schema.Struct({
  projectRoot: Schema.String,
  generatedDirectory: Schema.String,
  networkAllowlist: Schema.Array(Schema.String),
});

/** Captured candidate observations, preserving encounter order. */
export const EvaluatorDetectorReportSchema = Schema.Struct({
  sideEffects: Schema.Array(EvaluatorSideEffect),
  stdout: Schema.String,
  stderr: Schema.String,
});

/** Expected rejection thrown only at synchronous native candidate boundaries. */
export class EvaluatorBlockedOperation extends Schema.TaggedError<EvaluatorBlockedOperation>()(
  "EvaluatorBlockedOperation",
  { kind: EvaluatorSideEffect.fields.kind, operation: Schema.String, target: Schema.String },
) {
  /**
   * Describes the blocked native capability without exposing its invocation arguments.
   * @returns The rejection message presented at the native callback boundary.
   */
  override get message(): string {
    return `Evaluator blocked ${this.kind} through ${this.operation}.`;
  }
}

/**
 * Acquires native hooks for one candidate and binds their release to the surrounding scope.
 * @param options - Sandbox roots and explicit outbound network permissions.
 * @returns A lazy effect yielding the session; requires Scope.
 * @remarks Global hooks require sequential candidate evaluation. Partial installation, defects,
 * typed failures and interruption all release every acquired hook before leaving the scope.
 */
export const acquireEvaluatorDetectors = Effect.fn("Discovery.acquireEvaluatorDetectors")(
  function* (options: Options) {
    // Register ownership before installing any hook so even partial acquisition is finalized.
    const owner = yield* Effect.acquireRelease(makeOwner(), (owner) =>
      owner.session.restoreEffect(),
    );
    yield* installHooks(owner, options);
    return owner.session;
  },
  (effect, options) =>
    observeCompiler("discovery", "acquireEvaluatorDetectors", effect, () => ({}), false),
);

/**
 * Installs a manually owned detector session for synchronous compatibility callers.
 * @param options - Sandbox roots and explicit outbound network permissions.
 * @returns A session whose restore method the caller must invoke.
 * @throws AggregateError when native installation or rollback fails.
 */
export function installEvaluatorDetectors(options: Options): EvaluatorDetectorSession {
  const owner = runDiscoverySync(makeOwner());
  const exit = Effect.runSyncExit(installHooks(owner, options));
  if (Exit.isSuccess(exit)) return owner.session;
  const cleanup = Effect.runSyncExit(owner.session.restoreEffect());
  throw new AggregateError(
    Exit.isFailure(cleanup)
      ? [Cause.squash(exit.cause), Cause.squash(cleanup.cause)]
      : [Cause.squash(exit.cause)],
    "Evaluator detector installation failed.",
  );
}

/**
 * Creates process-local capabilities and observations for an exclusively owned candidate.
 * @returns A lazy effect yielding the owner before any native hook is acquired.
 */
const makeOwner = Effect.fn("Discovery.makeDetectorOwner")(function* () {
  const sideEffects: Schema.Schema.Type<typeof EvaluatorSideEffect>[] = [];
  const timersByHandle = new Map<unknown, TimerRecord>();
  const restores: Restore[] = [];
  let stdout = "";
  let stderr = "";
  let restored = false;

  /**
   * Records one native observation in encounter order.
   * @param kind - Detector category.
   * @param operation - Native invocation label.
   * @param target - Diagnostic destination.
   * @returns Nothing after appending the trusted observation.
   */
  const record = (kind: EvaluatorSideEffectKind, operation: string, target: string): void => {
    sideEffects.push(EvaluatorSideEffect.make({ kind, operation, target }));
  };
  // Native APIs require synchronous callbacks; state is private to the owning scope.

  /**
   * Records and rejects an unsafe native call before platform invocation.
   * @param kind - Blocked capability category.
   * @param operation - Native invocation label.
   * @param target - Diagnostic destination.
   * @returns Never; the native rejection is caught only at the import boundary.
   */
  const violate: Violate = (kind, operation, target) => {
    record(kind, operation, target);
    throw new EvaluatorBlockedOperation({ kind, operation, target });
  };

  /**
   * Captures output while the candidate exclusively owns native hooks.
   * @param stream - Destination stream.
   * @param value - Native adapter's rendered output chunk.
   * @returns Nothing after retaining the output and observation.
   */
  const capture = (stream: "stdout" | "stderr", value: string): void => {
    record("direct-output", `${stream}.write`, stream);
    if (stream === "stdout") stdout += value;
    else stderr += value;
  };

  /**
   * Cancels surviving timers and snapshots candidate observations.
   * @returns A lazy effect yielding the immutable report; cancellation defects remain visible.
   */
  const finishEffect = Effect.fn("Discovery.finishDetectorSession")(function* () {
    yield* Effect.forEach(
      timersByHandle,
      ([handle, timer]) =>
        Effect.gen(function* () {
          record("live-timer", timer.kind, timer.kind);
          yield* Effect.sync(timer.cancel);
          timersByHandle.delete(handle);
        }),
      { discard: true },
    );
    return EvaluatorDetectorReportSchema.make({
      sideEffects: Object.freeze([...sideEffects]),
      stdout,
      stderr,
    });
  });

  /**
   * Releases every native hook exactly once and aggregates release defects.
   * @returns A lazy release effect; all releases are attempted before defects are propagated.
   * @remarks Early manual release is masked too, so interruption cannot strand remaining hooks.
   */
  const restoreEffect = Effect.fn("Discovery.restoreDetectorSession")(function* () {
    if (restored) return;
    restored = true;
    const releases = [...timersByHandle.values()].map((timer) => timer.cancel);
    timersByHandle.clear();
    releases.push(...restores.reverse());
    const failures: unknown[] = [];
    yield* Effect.forEach(
      releases,
      (release) =>
        Effect.gen(function* () {
          // Defect inspection supervises finalizers: continue cleanup, then retain every failure.
          const exit = yield* Effect.sync(release).pipe(Effect.exit);
          if (Exit.isFailure(exit)) failures.push(Cause.squash(exit.cause));
        }),
      { discard: true },
    );
    if (failures.length > 0)
      yield* Effect.die(new AggregateError(failures, "Evaluator detector release failed."));
  }, Effect.uninterruptible);
  const session: EvaluatorDetectorSession = {
    finishEffect,
    restoreEffect,
    finish: () => runDiscoverySync(finishEffect()),
    restore: () => runDiscoverySync(restoreEffect()),
  };
  return { session, timersByHandle, restores, violate, capture };
});

/**
 * Installs the native interception stages in a fixed rollback order.
 * @param owner - Session-local native capabilities and observation callbacks.
 * @param options - Roots and approved outbound destinations.
 * @returns A lazy effect that completes once all hooks are installed.
 */
const installHooks = Effect.fn("Discovery.installDetectorHooks")(function* (
  owner: Effect.Success<ReturnType<typeof makeOwner>>,
  options: Options,
) {
  yield* installTimersEffect(owner.timersByHandle, owner.restores);
  yield* installOutputEffect(owner.restores, owner.capture);
  yield* installFileDetectorsEffect(options, owner.restores, owner.violate);
  yield* installNetworkDetectorsEffect(options.networkAllowlist, owner.restores, owner.violate);
});
