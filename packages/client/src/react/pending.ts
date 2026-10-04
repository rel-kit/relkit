import type { PendingOperationMetadata } from "@relkit/contracts";
import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import { ManagedRuntime } from "effect";
import { runExecutionSync, runExecutionPromise } from "@relkit/contracts/operation";
import type { RelkitKeyScope } from "./keys.js";
import { PendingOperations, pendingOperationsLayer } from "./pending.service.js";
import type { PendingRememberOptions, PendingReferences } from "./pending.types.js";
import { jobUnknownOutcome } from "./pending-outcome.js";
export { jobUnknownOutcome } from "./pending-outcome.js";
export type { PendingRememberOptions } from "./pending.types.js";
export {
  PendingCapacityError,
  PendingRecoveryUnavailableError,
  PendingRequestMismatchError,
} from "./pending-errors.js";

// This browser-wide owner holds only plain metadata and borrowed storage. It never
// acquires a socket, listener, timer or worker; each async call owns its own fiber.
const owner = ManagedRuntime.make(pendingOperationsLayer());
const service = runExecutionSync(owner, PendingOperations);

/**
 * Preserves the complete existing scope serialization used by query and receipt keys.
 * @param scope - Application/environment/identity scope.
 * @returns Its exact existing JSON key.
 */
export function pendingScopeKey(scope: RelkitKeyScope): string {
  return JSON.stringify(scope);
}

/**
 * Records a submission before dispatch without persisting its sensitive request.
 * @param scopeKey - Full identity scope key.
 * @param kind - Existing operation kind.
 * @param resourceId - Declared resource identity.
 * @param value - Transmitted request used for the digest.
 * @param references - Thread/run references.
 * @param options - Explicit receipt/recovery and memory-retention options.
 * @returns Existing public metadata or the original public failure.
 */
export function rememberPending(
  scopeKey: string,
  kind: PendingOperationMetadata["kind"],
  resourceId: string,
  value: unknown,
  references: PendingReferences = {},
  options: PendingRememberOptions = {},
): Promise<PendingOperationMetadata> {
  return runExecutionPromise(
    owner,
    service.remember(scopeKey, kind, resourceId, value, references, options),
  );
}

/**
 * Remembers a job intent and retains its transmitted request only in memory.
 * @param scopeKey - Full identity scope key.
 * @param resourceId - Declared job.
 * @param request - Exact transmitted input/options.
 * @param options - Receipt and recovery authority.
 * @returns The recorded public metadata.
 */
export function rememberJobPending(
  scopeKey: string,
  resourceId: string,
  request: unknown,
  options: PendingRememberOptions = {},
): Promise<PendingOperationMetadata> {
  return rememberPending(
    scopeKey,
    "job-trigger",
    resourceId,
    request,
    {},
    { ...options, retainRequest: true },
  );
}

/**
 * Updates metadata while preserving a previously retained in-memory request.
 * @param scopeKey - Full identity scope.
 * @param value - Authoritative updated receipt metadata.
 * @returns Nothing, synchronously.
 */
export function updatePending(scopeKey: string, value: PendingOperationMetadata): void {
  runExecutionSync(owner, service.update(scopeKey, value));
}

/**
 * Removes memory and best-effort persisted metadata after a known outcome.
 * @param scopeKey - Full identity scope.
 * @param operationId - Receipt identity.
 * @returns Nothing, synchronously.
 */
export function forgetPending(scopeKey: string, operationId: string): void {
  runExecutionSync(owner, service.forget(scopeKey, operationId));
}

/**
 * Merges recovered metadata with newer in-memory values without discarding authority.
 * @param scopeKey - Full identity scope.
 * @returns Pending metadata in existing insertion order.
 */
export function pendingOperations(scopeKey: string): readonly PendingOperationMetadata[] {
  return runExecutionSync(owner, service.list(scopeKey));
}

/**
 * Reads a transmitted request; restored session metadata never recreates input.
 * @param scopeKey - Full identity scope.
 * @param operationId - Receipt identity.
 * @returns The original in-memory request or undefined.
 */
export function pendingRequest(scopeKey: string, operationId: string): unknown {
  return runExecutionSync(owner, service.request(scopeKey, operationId));
}

/**
 * Compares a proposed retry against its recorded transmitted request digest.
 * @param scopeKey - Full identity scope.
 * @param operationId - Receipt identity.
 * @param request - Proposed transmitted request.
 * @returns Whether its digest matches existing authority.
 */
export function matchesPendingRequest(
  scopeKey: string,
  operationId: string,
  request: unknown,
): Promise<boolean> {
  return runExecutionPromise(owner, service.matches(scopeKey, operationId, request));
}

/**
 * Clears every receipt in an explicitly retired identity scope.
 * @param scopeKey - Full identity scope.
 * @returns Nothing, synchronously.
 */
export function clearPendingOperations(scopeKey: string): void {
  runExecutionSync(owner, service.clear(scopeKey));
}

/**
 * Checks nested public error envelopes for an unknown job outcome.
 * @param value - Original rejected transport value.
 * @returns Whether it carries recognized job recovery authority.
 */
export function isJobUnknownOutcome(value: unknown): value is JobUnknownOutcome {
  return jobUnknownOutcome(value) !== undefined;
}

/**
 * Hashes the existing canonical transmitted request representation.
 * @param value - Transmitted request.
 * @returns Its SHA-256 digest with the existing prefix.
 */
export function digestPendingRequest(value: unknown): Promise<string> {
  return runExecutionPromise(owner, service.digest(value));
}
