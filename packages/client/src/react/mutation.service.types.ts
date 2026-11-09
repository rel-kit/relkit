import type { PendingOperationMetadata } from "relkit/contracts";
import type { PendingReferences, PendingRememberOptions } from "./pending.types.js";
/** Accepted-work submission authority shared by finite and job React adapters. */
export interface MutationOperationsService {
  /** Dispatches accepted work independently of the submitting view lifetime.
   * @param scope - Complete pending receipt isolation scope.
   * @param kind - Existing submission category.
   * @param resource - Declared route or job identity.
   * @param input - Transmitted input retained only in opted-in memory.
   * @param references - Existing receipt references.
   * @param options - Existing idempotency, reuse and retention policy.
   * @param execute - Native server submission boundary.
   * @returns The original result, or the original rejection after metadata settlement. */
  readonly submit: (
    scope: string,
    kind: PendingOperationMetadata["kind"],
    resource: string,
    input: unknown,
    references: PendingReferences,
    options: PendingRememberOptions,
    execute: () => PromiseLike<unknown>,
  ) => Promise<unknown>;
  /** Applies the existing unknown-outcome policy to receipt metadata.
   * @param scope - Complete pending receipt isolation scope.
   * @param pending - Previously stored metadata.
   * @param error - Original native rejection.
   * @returns Nothing, after a synchronous metadata update. */
  readonly settle: (scope: string, pending: PendingOperationMetadata, error: unknown) => void;
}
