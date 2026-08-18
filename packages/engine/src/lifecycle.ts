export const GENERATION_LIFECYCLE_STATES = [
  "constructing",
  "ready",
  "draining",
  "shutting-down",
  "shutdown",
] as const;

export type GenerationLifecycleState = (typeof GENERATION_LIFECYCLE_STATES)[number];
export type GenerationState = GenerationLifecycleState;

export interface GenerationLifecycleSnapshot {
  readonly state: GenerationLifecycleState;
  readonly activeCount: number;
  readonly accepting: boolean;
}

export interface GenerationLease {
  readonly release: () => void;
}

export class GenerationLifecycleError extends Error {
  readonly state: GenerationLifecycleState;

  constructor(state: GenerationLifecycleState, message: string) {
    super(`Generation ${message} in state ${state}`);
    this.name = "GenerationLifecycleError";
    this.state = state;
  }
}

/** Tracks generation readiness, admission, draining, and final shutdown. */
export class GenerationLifecycle {
  private currentState: GenerationLifecycleState = "constructing";
  private activeCountValue = 0;
  private readonly idleResolvers = new Set<() => void>();

  get state(): GenerationLifecycleState {
    return this.currentState;
  }

  get activeCount(): number {
    return this.activeCountValue;
  }

  get accepting(): boolean {
    return this.currentState === "ready";
  }

  snapshot(): GenerationLifecycleSnapshot {
    return Object.freeze({
      state: this.currentState,
      activeCount: this.activeCountValue,
      accepting: this.accepting,
    });
  }

  markReady(): void {
    this.requireState("mark ready", "constructing");
    this.currentState = "ready";
  }

  beginDrain(): void {
    if (this.currentState === "draining" || this.currentState === "shutting-down") return;
    if (this.currentState === "shutdown") return;
    this.requireState("begin drain", "ready");
    this.currentState = "draining";
  }

  beginShutdown(): void {
    if (this.currentState === "shutting-down" || this.currentState === "shutdown") return;
    if (
      this.currentState !== "constructing" &&
      this.currentState !== "ready" &&
      this.currentState !== "draining"
    ) {
      throw new GenerationLifecycleError(this.currentState, "cannot begin shutdown");
    }
    this.currentState = "shutting-down";
  }

  completeShutdown(): void {
    if (this.currentState === "shutdown") return;
    this.requireState("complete shutdown", "shutting-down");
    if (this.activeCountValue > 0) {
      throw new GenerationLifecycleError(
        this.currentState,
        "cannot complete shutdown with active work",
      );
    }
    this.currentState = "shutdown";
  }

  /** Admits work only while ready and returns an idempotent release lease. */
  acquire(): GenerationLease {
    if (!this.accepting) {
      throw new GenerationLifecycleError(this.currentState, "cannot accept new work");
    }
    this.activeCountValue += 1;
    let released = false;
    return Object.freeze({
      release: () => {
        if (released) return;
        released = true;
        this.activeCountValue -= 1;
        this.resolveIdle();
      },
    });
  }

  waitForIdle(): Promise<void> {
    if (this.activeCountValue === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.add(resolve));
  }

  private requireState(action: string, expected: GenerationLifecycleState): void {
    if (this.currentState !== expected) {
      throw new GenerationLifecycleError(
        this.currentState,
        `cannot ${action}; expected ${expected}`,
      );
    }
  }

  private resolveIdle(): void {
    if (this.activeCountValue !== 0) return;
    const resolvers = [...this.idleResolvers];
    this.idleResolvers.clear();
    for (const resolve of resolvers) resolve();
  }
}

export function createGenerationLifecycle(): GenerationLifecycle {
  return new GenerationLifecycle();
}
