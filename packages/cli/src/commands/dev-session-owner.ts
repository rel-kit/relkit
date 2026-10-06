import { Cause, Context, Effect, Layer, ManagedRuntime, MutableRef, Ref } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect";
import { cliOriginalError, type CliAdapterError } from "../cli-errors.js";
import { cliCleanupSnapshotUnsafe, retainCliCleanupFailures } from "../cli-cleanup-evidence.js";
import { makeDevSessionEngineEffect, devSessionCapabilitiesLayer } from "./dev-session-engine.js";
import type { DevSessionEngine } from "./dev-session.types.js";
import type { DevSession } from "./dev-session.js";

/** Service acquired only by the retained public manual-owner facade. */
export class ManualSessionEngine extends Context.Service<ManualSessionEngine, DevSessionEngine>()(
  "relkit/cli/ManualDevSession",
) {}

/**
 * Public Promise/synchronous edge lifetime, separate from native command orchestration.
 * @typeParam A - Actual public session subtype returned by shared startup.
 */
export class ManualDevSessionOwner<A extends DevSession> {
  private runtime: ManagedRuntime.ManagedRuntime<ManualSessionEngine, CliAdapterError> | undefined;
  private engine: DevSessionEngine | undefined;
  private readonly starting = Ref.makeUnsafe<Promise<A> | undefined>(undefined);
  private readonly stopping = Ref.makeUnsafe<Promise<void> | undefined>(undefined);

  /**
   * Retains the facade without acquiring or starting its resource graph.
   * @param session - Public facade whose engine owns all resources.
   */
  constructor(private readonly session: A) {}

  /**
   * Captures the acquired engine for release evidence, including acquisition failure.
   * @param engine - Native session graph captured in the public owner.
   * @returns No value; native commands retain their caller-owned Scope.
   */
  attach(engine: DevSessionEngine): void {
    this.engine = engine;
  }

  /**
   * Acquires one runtime and coalesces all manual startup callers.
   * @returns This public facade after the initial candidate is ready.
   */
  start(): Promise<A> {
    const existing = Ref.getUnsafe(this.starting);
    if (existing) return existing;
    const layer = Layer.effect(ManualSessionEngine, makeDevSessionEngineEffect(this.session)).pipe(
      Layer.provide(devSessionCapabilitiesLayer),
    );
    this.runtime = ManagedRuntime.make(
      layer.pipe(
        Layer.provideMerge(createLoggerLayer({ component: "cli", human: false, json: false })),
      ),
    );
    const started = this.run(ManualSessionEngine.use((engine) => engine.start)).then(
      () => this.session,
      async (error) => {
        const original = this.session.options.signal?.aborted
          ? this.session.options.signal.reason
          : error;
        let disposal: unknown;
        try {
          await this.runtime?.dispose();
        } catch (error) {
          disposal = error;
        }
        const evidence = this.engine ? cliCleanupSnapshotUnsafe(this.engine.cleanup) : [];
        retainCliCleanupFailures(
          original,
          disposal === undefined
            ? evidence
            : [
                ...evidence,
                { operation: "dev.runtime.acquire.rollback", cause: Cause.fail(disposal) },
              ],
        );
        throw original;
      },
    );
    MutableRef.set(this.starting.ref, started);
    return started;
  }

  /**
   * Shares physical release among all manual stop callers.
   * @param reason - Original shutdown cause retained beside cleanup receipts.
   * @returns Joined shutdown and runtime disposal without replacing the primary result.
   */
  stop(reason: unknown): Promise<void> {
    const existing = Ref.getUnsafe(this.stopping);
    if (existing) return existing;
    const stopped =
      this.runtime === undefined
        ? Promise.resolve()
        : this.run(ManualSessionEngine.use((engine) => engine.stop(reason))).finally(async () => {
            let disposal: unknown;
            try {
              await this.runtime?.dispose();
            } catch (error) {
              disposal = error;
            }
            const evidence = this.engine ? cliCleanupSnapshotUnsafe(this.engine.cleanup) : [];
            const receipts =
              disposal === undefined
                ? evidence
                : [...evidence, { operation: "dev.runtime.release", cause: Cause.fail(disposal) }];
            retainCliCleanupFailures(this.session, receipts);
            retainCliCleanupFailures(reason, receipts);
          });
    MutableRef.set(this.stopping.ref, stopped);
    return stopped;
  }

  /**
   * Executes only a synchronous public compatibility edge.
   * @typeParam B - Successful result.
   * @typeParam E - Original typed failure.
   * @param effect - Captured synchronously completable work.
   * @returns The original value; suspension remains a programming error.
   */
  runSync<B, E>(effect: Effect.Effect<B, E>): B {
    if (!this.runtime) throw new Error("Development session has not started.");
    return runExecutionSync(this.runtime, effect.pipe(Effect.mapError(cliOriginalError)));
  }

  /**
   * Executes only a public Promise edge in this acquired runtime.
   * @typeParam B - Successful result.
   * @typeParam E - Original typed failure.
   * @param effect - Work using this manual session's captured authority.
   * @returns The original value or rejection after owned release barriers.
   */
  run<B, E>(effect: Effect.Effect<B, E, ManualSessionEngine>): Promise<B> {
    if (!this.runtime) return Promise.reject(new Error("Development session has not started."));
    return runExecutionPromise(this.runtime, effect.pipe(Effect.mapError(cliOriginalError)));
  }
}
