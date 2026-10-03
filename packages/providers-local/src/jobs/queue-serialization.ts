import { Effect, Semaphore } from "effect";
import { runLocal, runLocalSync, type LocalOperationError } from "../local-effect.js";

/**
 * Creates a queue-owned permit shared by all native mutation adapters.
 * @returns A generic runner preserving result/error identities while serializing mutations.
 * @remarks The permit is released on every Effect exit; durable write sections own their masking.
 */
export function makeQueueSerializer() {
  const lock = runLocalSync(Semaphore.make(1));
  return <T>(work: Effect.Effect<T, LocalOperationError>): Promise<T> =>
    runLocal(lock.withPermits(1)(work));
}
