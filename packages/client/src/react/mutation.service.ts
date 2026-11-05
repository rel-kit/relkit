import { ORPCError } from "@orpc/client";
import type { MutationOperationsService } from "./mutation.service.types.js";
import { jobUnknownOutcome } from "./pending-outcome.js";
import type { PendingOperationService } from "./pending.types.js";

/**
 * Creates accepted-work submission and pending-outcome settlement over one pending service.
 * @param pending - The pending-operation state receipts are recorded in.
 * @returns The submission service.
 * @remarks Application view cleanup cannot abort accepted server work.
 * @see tests/compatibility/pending.test.ts for checked metadata and recovery behavior.
 */
export function createMutationOperations(
  pending: PendingOperationService,
): MutationOperationsService {
  const settle: MutationOperationsService["settle"] = (scope, entry, error) => {
    const unknown = jobUnknownOutcome(error);
    if (unknown !== undefined)
      pending.update(scope, {
        ...entry,
        state: "unknown",
        ...(unknown.idempotencyKey === undefined ? {} : { idempotencyKey: unknown.idempotencyKey }),
        recovery: unknown.recovery,
      });
    else if (error instanceof ORPCError) pending.forget(scope, entry.operationId);
    else pending.update(scope, { ...entry, state: "unknown" });
  };
  return {
    settle,
    submit: async (scope, kind, resource, input, references, options, execute) => {
      const entry = await pending.remember(scope, kind, resource, input, references, options);
      let result: unknown;
      try {
        result = await execute();
      } catch (error) {
        settle(scope, entry, error);
        throw error;
      }
      pending.forget(scope, entry.operationId);
      return result;
    },
  };
}
