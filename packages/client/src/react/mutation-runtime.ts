import { createMutationOperations } from "./mutation.service.js";
import { pendingOperations } from "./pending.service.js";

/** Browser-wide submission service over the browser-wide pending-operation state. */
export const mutationOperations = createMutationOperations(pendingOperations);

/**
 * Submits accepted work with pending-receipt tracking.
 * @param args - Scope, kind, resource, input, references, options and native submission.
 * @returns The native result, or its original rejection after the receipt is settled.
 */
export function submitMutation(
  ...args: Parameters<typeof mutationOperations.submit>
): Promise<unknown> {
  return mutationOperations.submit(...args);
}
