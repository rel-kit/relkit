import { Cause, Effect, Exit, Layer, ManagedRuntime, Metric } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { observeExecution } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { createSupervisorStateMachine } from "./state-machine.js";
import type { SupervisorStateMachine } from "./state-machine.js";
import { createWatcherLayer, SupervisorSourceWatcher } from "./watcher-service.js";
import type {
  SupervisorSourceChange,
  SupervisorWatcherOptions,
  WatcherService,
} from "./watcher.types.js";
export type {
  SupervisorSourceChange,
  SupervisorCompileRequest,
  SupervisorCompile,
  SupervisorWatcherOptions,
} from "./watcher.types.js";

/** Synchronous source admission over one reusable, scoped scheduling service. */
export class SupervisorWatcher {
  readonly stateMachine: SupervisorStateMachine;
  private readonly owner;
  private readonly service: WatcherService;
  private readonly context;
  private closing: Promise<void> | undefined;
  private finalVersion: number | undefined;

  /** Acquires state once without starting compilation. @param options - Dependencies and timing. */
  constructor(options: SupervisorWatcherOptions) {
    this.stateMachine =
      options.stateMachine ??
      createSupervisorStateMachine(options.logger === undefined ? {} : { logger: options.logger });
    this.owner = ManagedRuntime.make(
      Layer.mergeAll(
        createWatcherLayer(options, this.stateMachine),
        createLoggerLayer({ component: "supervisor", ...options.logger }),
        Layer.succeed(Metric.MetricRegistry, new Map()),
      ),
    );
    this.service = runExecutionSync(this.owner, SupervisorSourceWatcher);
    this.context = runExecutionSync(this.owner, Effect.context<never>());
  }

  /** Latest admitted revision, retained after disposal. */
  get version(): number | undefined {
    return this.closing === undefined
      ? runExecutionSync(this.owner, this.service.version)
      : this.finalVersion;
  }

  /** Accepts a source batch synchronously. @param change - Revision and coalesced paths.
   * @returns Its generation token, or undefined for an older revision.
   */
  notify(change: SupervisorSourceChange) {
    if (this.closing !== undefined) throw new Error("Supervisor watcher is disposed.");
    return runExecutionSync(this.owner, this.service.notify(change));
  }

  /** Alias for admission. @param change - Source batch. @returns Its admitted token. */
  sourceChanged(change: SupervisorSourceChange) {
    return this.notify(change);
  }

  /** Starts pending work immediately and joins it. @returns Completion of accepted work. */
  flush(): Promise<void> {
    if (this.closing !== undefined) return Promise.resolve();
    return this.owner.runPromiseExit(this.service.flush).then((exit) => {
      if (Exit.isSuccess(exit)) return exit.value;
      if (this.closing !== undefined && Cause.hasInterruptsOnly(exit.cause)) return;
      throw Cause.squash(exit.cause);
    });
  }

  /** Stops admission and aborts native compilation synchronously; close joins cleanup. */
  dispose(): void {
    if (this.closing !== undefined) return;
    this.finalVersion = this.version;
    /** Resolves the published cleanup promise. @returns After native completion publication. */
    let complete: () => void = () => undefined;
    /** Rejects the published cleanup promise. @param error - Original cleanup failure. @returns After native failure publication. */
    let fail: (error: unknown) => void = () => undefined;
    // Publish the native Promise before abort callbacks can reenter close.
    this.closing = new Promise<void>((resolve, reject) => {
      complete = resolve;
      fail = reject;
    });
    void this.closing.catch(() => undefined);
    let admissionFailure: unknown;
    let failed = false;
    try {
      runExecutionSync(this.owner, this.service.dispose);
    } catch (error) {
      failed = true;
      admissionFailure = error;
    }
    // Disposal runs outside the scope it closes, retaining the configured sink context.
    void Effect.runPromiseExitWith(this.context)(
      observeExecution("supervisor", "watcher.close", this.owner.disposeEffect, () => ({
        generations: 1,
      })),
    ).then((exit) => {
      if (failed) fail(admissionFailure);
      else if (Exit.isFailure(exit)) fail(Cause.squash(exit.cause));
      else complete();
    }, fail);
    if (failed) throw admissionFailure;
  }

  /** Awaits exactly-once debounce and worker cleanup. @returns Closed owner scope. */
  close(): Promise<void> {
    this.dispose();
    return this.closing!;
  }
}

/**
 * Creates a synchronously ready watcher owner.
 * @param options - Native compiler and explicit debounce policy.
 * @returns A watcher; dispose stops admission and close awaits cleanup.
 * @example
 * ```ts
 * import { createSupervisorWatcher } from "@relkit/supervisor";
 * export async function watchSources(): Promise<void> {
 * const watcher = createSupervisorWatcher({ compile: () => undefined,
 *   logger: { human: false, json: false } });
 * try { watcher.notify({ version: 1 }); await watcher.flush(); }
 * finally { await watcher.close(); }
 * }
 * ```
 */
export function createSupervisorWatcher(options: SupervisorWatcherOptions): SupervisorWatcher {
  return new SupervisorWatcher(options);
}
