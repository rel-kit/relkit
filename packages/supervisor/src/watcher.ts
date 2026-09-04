import { createSupervisorStateMachine } from "./state-machine.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";
import type { SupervisorStateMachine } from "./state-machine.js";

export interface SupervisorSourceChange {
  readonly version: number;
  readonly changedFiles?: readonly string[];
}

export interface SupervisorCompileRequest {
  readonly token: SupervisorCandidateToken;
  readonly version: number;
  readonly changedFiles: readonly string[];
  readonly signal: AbortSignal;
  readonly isCurrent: () => boolean;
}

export type SupervisorCompile = (request: SupervisorCompileRequest) => void | PromiseLike<void>;

export interface SupervisorWatcherOptions {
  readonly compile: SupervisorCompile;
  readonly debounceMs?: number;
  readonly stateMachine?: SupervisorStateMachine;
}

interface PendingChange {
  readonly token: SupervisorCandidateToken;
  readonly version: number;
  readonly changedFiles: readonly string[];
}

interface ActiveCompile {
  readonly token: SupervisorCandidateToken;
  readonly controller: AbortController;
}

/** Coalesces source changes and protects the state machine from stale compiles. */
export class SupervisorWatcher {
  readonly stateMachine: SupervisorStateMachine;
  private readonly compile: SupervisorCompile;
  private readonly debounceMs: number;
  private latestVersion: number | undefined;
  private pending: PendingChange | undefined;
  private active: ActiveCompile | undefined;
  private activeRun: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(options: SupervisorWatcherOptions) {
    if (!Number.isFinite(options.debounceMs ?? 0) || (options.debounceMs ?? 0) < 0) {
      throw new RangeError("Supervisor watcher debounce must be a non-negative number.");
    }
    this.stateMachine = options.stateMachine ?? createSupervisorStateMachine();
    this.compile = options.compile;
    this.debounceMs = options.debounceMs ?? 0;
  }

  get version(): number | undefined {
    return this.latestVersion;
  }

  /** Accepts a source version and schedules only the newest accepted batch. */
  notify(change: SupervisorSourceChange): SupervisorCandidateToken | undefined {
    this.assertOpen();
    validateVersion(change.version);
    if (this.latestVersion !== undefined && change.version < this.latestVersion) return undefined;

    const token = this.stateMachine.requestSourceChange();
    this.latestVersion = change.version;
    this.pending = {
      token,
      version: change.version,
      changedFiles: mergeFiles(this.pending?.changedFiles, change.changedFiles),
    };
    this.active?.controller.abort(new Error("Source changed before compilation completed."));
    this.schedule();
    return token;
  }

  sourceChanged(change: SupervisorSourceChange): SupervisorCandidateToken | undefined {
    return this.notify(change);
  }

  /** Starts pending work immediately and waits for superseded work to settle. */
  async flush(): Promise<void> {
    this.clearTimer();
    while (!this.disposed && (this.pending !== undefined || this.activeRun !== undefined)) {
      if (this.activeRun !== undefined) await this.activeRun;
      if (this.activeRun === undefined && this.pending !== undefined) await this.startPending();
    }
  }

  /** Aborts current compilation and makes its token unable to complete successfully. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    const token = this.pending?.token ?? this.active?.token;
    if (token !== undefined) this.stateMachine.compileFailed(token, "Supervisor watcher disposed.");
    this.pending = undefined;
    this.active?.controller.abort(new Error("Supervisor watcher disposed."));
  }

  private schedule(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.startPending();
    }, this.debounceMs);
  }

  private async startPending(): Promise<void> {
    if (this.disposed || this.active !== undefined || this.pending === undefined) return;
    const pending = this.pending;
    this.pending = undefined;
    const controller = new AbortController();
    const active: ActiveCompile = { token: pending.token, controller };
    this.active = active;
    const run = this.runCompile(pending, controller);
    this.activeRun = run;
    await run;
  }

  private async runCompile(pending: PendingChange, controller: AbortController): Promise<void> {
    try {
      await this.compile({
        token: pending.token,
        version: pending.version,
        changedFiles: pending.changedFiles,
        signal: controller.signal,
        isCurrent: () => this.isCurrent(pending),
      });
      this.stateMachine.compileSucceeded(pending.token);
    } catch (error) {
      this.stateMachine.compileFailed(pending.token, error);
    } finally {
      if (this.active?.token === pending.token) {
        this.active = undefined;
        this.activeRun = undefined;
        if (!this.disposed && this.pending !== undefined) this.schedule();
      }
    }
  }

  private isCurrent(pending: PendingChange): boolean {
    const candidate = this.stateMachine.snapshot().candidate;
    return (
      !this.disposed &&
      this.latestVersion === pending.version &&
      candidate?.sourceToken === pending.token.sourceToken &&
      candidate.generationToken === pending.token.generationToken
    );
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("Supervisor watcher is disposed.");
  }
}

export function createSupervisorWatcher(options: SupervisorWatcherOptions): SupervisorWatcher {
  return new SupervisorWatcher(options);
}

function validateVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new TypeError("Supervisor source versions must be non-negative safe integers.");
  }
}

function mergeFiles(
  previous: readonly string[] | undefined,
  current: readonly string[] | undefined,
): readonly string[] {
  return Object.freeze([...new Set([...(previous ?? []), ...(current ?? [])])]);
}
