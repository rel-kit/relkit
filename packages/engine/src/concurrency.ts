import { makeAdmission } from "./concurrency.service.js";
import type {
  AdmissionOperations,
  ConcurrencyAdmissionOptions,
  ConcurrencyAdmissionRequest,
} from "./concurrency.types.js";
import { runEnginePromise, runEngineSync } from "./engine-runtime.js";
import type { InvocationLease } from "./invoke-types.js";

export { effectiveConcurrencyLimit } from "./concurrency-limits.js";
export { admissionLayer, AdmissionService } from "./concurrency.service.js";
export type {
  ConcurrencyAdmissionOptions,
  ConcurrencyAdmissionRequest,
} from "./concurrency.types.js";

/** Native facade over the same coordinated admission authority used by live Layers. */
export class ConcurrencyAdmission {
  readonly generationId: string;
  private readonly operations: AdmissionOperations;
  readonly acquireEffect: AdmissionOperations["acquire"];

  /** Allocate isolated generation capacity.
   * @param options - Generation identity and admission-time lease authority.
   */
  constructor(options: ConcurrencyAdmissionOptions = {}) {
    this.generationId = options.generationId ?? "generation";
    this.operations = runEngineSync(makeAdmission(options));
    this.acquireEffect = this.operations.acquire;
  }

  /** Wait for joint function/trigger capacity in FIFO order.
   * @param request - Validated limits, trigger identity and caller signal.
   * @returns A Promise of an idempotent admitted lease.
   */
  acquire(request: ConcurrencyAdmissionRequest): Promise<InvocationLease> {
    return runEnginePromise(this.operations.acquire(request));
  }

  /** Read admitted capacity for one function.
   * @param functionId - Stable function identity.
   * @returns Number of active unreleased leases.
   */
  activeCount(functionId: string): number {
    return runEngineSync(this.operations.activeCount(functionId));
  }

  /** Read queued capacity for one function.
   * @param functionId - Stable function identity.
   * @returns Number of live queued requests.
   */
  waitingCount(functionId: string): number {
    return runEngineSync(this.operations.waitingCount(functionId));
  }
}

/** Create isolated coordinated FIFO admission for one generation.
 * @param options - Generation identity and lease authority.
 * @returns A native facade over an isolated Effect-owned admission service.
 * @see admissionLayer for Effect composition.
 */
export function createConcurrencyAdmission(
  options: ConcurrencyAdmissionOptions = {},
): ConcurrencyAdmission {
  return new ConcurrencyAdmission(options);
}
