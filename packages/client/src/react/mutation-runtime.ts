import { runExecutionPromise, runExecutionSync } from "relkit/contracts/operation";
import { Layer, ManagedRuntime } from "effect";
import { MutationOperations, MutationOperationsLive } from "./mutation.service.js";
import { pendingOperationsLayer } from "./pending.service.js";

// Receipt state and borrowed storage are resource-free; each dispatch owns its fiber.
export const mutationRuntime = ManagedRuntime.make(
  MutationOperationsLive.pipe(Layer.provide(pendingOperationsLayer())),
);
/** Once-acquired submission service at the Promise/React compatibility boundary. */
export const mutationOperations = runExecutionSync(mutationRuntime, MutationOperations);

/**
 * Submits accepted work with pending-receipt tracking at the Promise boundary.
 * @param args - Scope, kind, resource, input, references, options and native submission.
 * @returns The native result, or its original rejection after the receipt is settled.
 */
export function submitMutation(
  ...args: Parameters<typeof mutationOperations.submit>
): Promise<unknown> {
  return runExecutionPromise(mutationRuntime, mutationOperations.submit(...args));
}
