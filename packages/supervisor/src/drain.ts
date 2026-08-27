import type { StartedCandidate } from "./candidate-types.js";
import { closeAction, resourceAction } from "./drain-cleanup.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";
import {
  type SupervisorDrainFailure,
  type SupervisorDrainLease,
  type SupervisorDrainOptions,
  type SupervisorDrainReport,
  type SupervisorDrainResource,
  type SupervisorDrainResourceResult,
  type SupervisorDrainStateTransition,
  type SupervisorDrainWorkOptions,
} from "./drain-types.js";
export * from "./drain-types.js";
export { drainPreviousGeneration } from "./drain-state.js";
export const DEFAULT_SUPERVISOR_DRAIN_TIMEOUT_MS = 1_000;
interface TrackedWork {
  readonly controller: AbortController;
  readonly interrupt: SupervisorDrainWorkOptions["interrupt"];
}
export class SupervisorDrainError extends Error {
  readonly code: "RELKIT_DRAIN_STATE_INVALID" | "RELKIT_DRAIN_TOKEN_MISMATCH";
  constructor(code: SupervisorDrainError["code"], message: string) {
    super(message);
    this.name = "SupervisorDrainError";
    this.code = code;
  }
}
/** Owns admission and bounded cleanup for one retired generation token. */
export class SupervisorGenerationDrain {
  readonly token: SupervisorCandidateToken;
  readonly deadlineMs: number;
  private readonly now: () => number;
  private readonly candidate: SupervisorDrainOptions["candidate"];
  private readonly providers: readonly SupervisorDrainResource[];
  private readonly onReport: SupervisorDrainOptions["onReport"];
  private readonly work = new Map<number, TrackedWork>();
  private readonly idleWaiters = new Set<() => void>();
  private nextWorkId = 0;
  private accepting = true;
  private shutdown: Promise<SupervisorDrainReport> | undefined;
  constructor(options: SupervisorDrainOptions) {
    validateSupervisorToken(options.token);
    if (options.candidate !== undefined && !sameToken(options.candidate.token, options.token)) {
      throw new SupervisorDrainError(
        "RELKIT_DRAIN_TOKEN_MISMATCH",
        "The candidate token does not match the retired generation.",
      );
    }
    const deadlineMs = options.deadlineMs ?? DEFAULT_SUPERVISOR_DRAIN_TIMEOUT_MS;
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0) {
      throw new RangeError("Supervisor drain deadline must be a non-negative safe integer.");
    }
    this.token = Object.freeze({ ...options.token });
    this.deadlineMs = deadlineMs;
    this.now = options.now ?? Date.now;
    this.candidate = options.candidate;
    this.providers = Object.freeze([...(options.providers ?? [])]);
    this.onReport = options.onReport;
  }
  get inFlight(): number {
    return this.work.size;
  }
  get acceptingWork(): boolean {
    return this.accepting;
  }
  /** Creates a generation-scoped cancellation signal; returns undefined after drain starts. */
  track(
    token: SupervisorCandidateToken,
    options: SupervisorDrainWorkOptions = {},
  ): SupervisorDrainLease | undefined {
    validateSupervisorToken(token);
    if (!this.accepting || !sameToken(token, this.token)) return undefined;
    const id = ++this.nextWorkId;
    const tracked: TrackedWork = {
      controller: new AbortController(),
      interrupt: options.interrupt,
    };
    this.work.set(id, tracked);
    return Object.freeze({
      token: this.token,
      signal: tracked.controller.signal,
      release: () => this.release(id),
    });
  }
  /** Waits for work, interrupts the remainder, and releases resources at one bounded deadline. */
  drain(): Promise<SupervisorDrainReport> {
    this.shutdown ??= this.run();
    return this.shutdown;
  }

  private async run(): Promise<SupervisorDrainReport> {
    this.accepting = false;
    const startedAt = this.now();
    const deadlineAt = startedAt + this.deadlineMs;
    const initialInFlight = this.work.size;
    let interrupted = 0;
    let timedOut = !(await this.waitForIdle(deadlineAt));
    if (timedOut) {
      const pending = [...this.work.values()];
      for (const work of pending) {
        if (work.controller.signal.aborted) continue;
        work.controller.abort(new Error("Retired generation drain deadline expired."));
        interrupted += 1;
        try {
          void Promise.resolve(
            work.interrupt?.("Retired generation drain deadline expired."),
          ).catch(() => undefined);
        } catch {
          // Interruption is best effort; the bounded report still closes resources.
        }
      }
    }
    const candidate = await closeAction("candidate", this.candidate?.dispose, deadlineAt, this.now);
    const providers: SupervisorDrainResourceResult[] = [];
    const failures: SupervisorDrainFailure[] = [];
    for (let index = this.providers.length - 1; index >= 0; index -= 1) {
      const provider = this.providers[index];
      if (provider === undefined) continue;
      const id = provider.id ?? `provider-${index}`;
      const result = await closeAction(id, resourceAction(provider), deadlineAt, this.now);
      providers.push({ id, status: result.status });
      if (result.message !== undefined) failures.push({ resource: id, message: result.message });
    }
    const remaining = this.work.size;
    timedOut ||=
      remaining > 0 ||
      candidate.status === "timed-out" ||
      providers.some((item) => item.status === "timed-out");
    if (candidate.message !== undefined)
      failures.push({ resource: "candidate", message: candidate.message });
    const outcome = timedOut
      ? "timed-out"
      : failures.length > 0
        ? "failed"
        : interrupted > 0
          ? "interrupted"
          : "drained";
    const report = Object.freeze({
      token: this.token,
      deadlineMs: this.deadlineMs,
      elapsedMs: Math.max(0, this.now() - startedAt),
      initialInFlight,
      completed: initialInFlight - remaining,
      interrupted,
      remaining,
      timedOut,
      outcome,
      candidate: candidate.status,
      providers: Object.freeze(providers.reverse()),
      failures: Object.freeze(failures),
      stateTransition: "not-configured" as SupervisorDrainStateTransition,
    });
    try {
      this.onReport?.(report);
    } catch {
      // Reporting cannot change generation cleanup.
    }
    return report;
  }

  private release(id: number): void {
    if (!this.work.delete(id) || this.work.size !== 0) return;
    const waiters = [...this.idleWaiters];
    this.idleWaiters.clear();
    for (const resolve of waiters) resolve();
  }

  private waitForIdle(deadlineAt: number): Promise<boolean> {
    if (this.work.size === 0) return Promise.resolve(true);
    const remaining = Math.max(0, deadlineAt - this.now());
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (drained: boolean): void => {
        if (timer !== undefined) clearTimeout(timer);
        this.idleWaiters.delete(onIdle);
        resolve(drained);
      };
      const onIdle = (): void => finish(true);
      this.idleWaiters.add(onIdle);
      timer = setTimeout(() => finish(false), remaining);
    });
  }
}

export function createSupervisorDrain(options: SupervisorDrainOptions): SupervisorGenerationDrain {
  return new SupervisorGenerationDrain(options);
}

function sameToken(
  left: SupervisorCandidateToken | undefined,
  right: SupervisorCandidateToken | undefined,
): boolean {
  return (
    Boolean(left && right) &&
    left?.sourceToken === right?.sourceToken &&
    left?.generationToken === right?.generationToken
  );
}
