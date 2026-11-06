import { runEnginePromise, runEngineSync } from "./engine-runtime.js";
import { makeGeneration } from "./lifecycle.service.js";
import type {
  GenerationLease,
  GenerationLifecycleSnapshot,
  GenerationLifecycleState,
} from "./lifecycle.types.js";
export * from "./lifecycle.service.js";

/** Synchronous facade over one Effect-owned generation state. */
export class GenerationLifecycle {
  private readonly service = runEngineSync(makeGeneration());

  /** Current generation lifecycle state. */
  get state(): GenerationLifecycleState {
    return this.snapshot().state;
  }

  /** Number of admitted, unreleased operations. */
  get activeCount(): number {
    return this.snapshot().activeCount;
  }

  /** Whether new work may acquire a generation lease. */
  get accepting(): boolean {
    return this.snapshot().accepting;
  }

  /** Read the immutable generation snapshot.
   * @returns Current state, admission flag and active count.
   */
  snapshot(): GenerationLifecycleSnapshot {
    return runEngineSync(this.service.snapshot());
  }

  /** Enable admission after successful startup.
   * @returns Nothing; throws GenerationLifecycleError for an invalid transition.
   */
  markReady(): void {
    runEngineSync(this.service.markReady());
  }

  /** Stop new admission while existing work drains.
   * @returns Nothing; repeated drain/shutdown requests are harmless.
   */
  beginDrain(): void {
    runEngineSync(this.service.beginDrain());
  }

  /** Enter shutdown, including partial startup cleanup.
   * @returns Nothing; repeating shutdown is harmless.
   */
  beginShutdown(): void {
    runEngineSync(this.service.beginShutdown());
  }

  /** Finish shutdown after every admitted operation releases.
   * @returns Nothing; throws while active work remains.
   */
  completeShutdown(): void {
    runEngineSync(this.service.completeShutdown());
  }

  /** Admit work only while ready.
   * @returns An idempotent lease whose release decrements the active count.
   */
  acquire(): GenerationLease {
    return runEngineSync(this.service.acquire());
  }

  /** Wait without timers for all admitted work to finish.
   * @returns A Promise resolved when the active count becomes zero.
   */
  waitForIdle(): Promise<void> {
    return runEnginePromise(this.service.waitForIdle());
  }
}

/** Construct a fresh generation facade.
 * @returns An isolated generation in the constructing state.
 * @see {@link GenerationService} for Effect composition.
 */
export function createGenerationLifecycle(): GenerationLifecycle {
  return new GenerationLifecycle();
}
