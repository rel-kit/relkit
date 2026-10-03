import { normalizeId } from "@relkit/contracts";
import { assertTime, JobQueueStateError } from "./queue-utils.js";
import type {
  JobQueueEntry,
  JobQueueLeaseOptions,
  JobQueueTransitionOptions,
} from "./queue-utils.js";

export const DEFAULT_LEASE_DURATION_MS = 30_000;

/** Validates the nonempty token identifying the current lease owner.
 * @param value - Value to validate, normalize or project.
 * @returns The validated ownership token.
 */
export function normalizeOwnerToken(value: string): string {
  return normalizeId(value);
}

/** Computes a bounded lease expiry from the requested duration and clock time.
 * @param now - Current clock time in milliseconds.
 * @param defaultDurationMs - Default lease duration in milliseconds.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The safe lease deadline in milliseconds.
 */
export function resolveLeaseExpiry(
  now: number,
  defaultDurationMs: number,
  options: JobQueueLeaseOptions,
): number {
  const expiresAt = options.leaseExpiresAt ?? now + (options.leaseDurationMs ?? defaultDurationMs);
  assertTime(expiresAt, "lease expiry");
  if (expiresAt <= now) throw new JobQueueStateError("Lease expiry must be in the future");
  return expiresAt;
}

/** Projects lease ownership into a queue transition precondition.
 * @param now - Current clock time in milliseconds.
 * @param defaultDurationMs - Default lease duration in milliseconds.
 * @param options - Operation-specific policy, hooks and configuration.
 * @param ownerToken - Token identifying the current lease owner.
 * @returns The normalized lease transition metadata.
 */
export function leaseTransitionOptions(
  now: number,
  defaultDurationMs: number,
  options: JobQueueLeaseOptions,
  ownerToken: string,
): JobQueueTransitionOptions {
  return {
    leaseExpiresAt: resolveLeaseExpiry(now, defaultDurationMs, options),
    leaseOwner: ownerToken,
  };
}

/** Rejects invalid or overflowing lease durations.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertLeaseDuration(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new JobQueueStateError("Lease duration is invalid");
}

/** Rejects stale ownership before a leased transition.
 * @param entry - Current queue or storage entry.
 * @param ownerToken - Token identifying the current lease owner.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertLeaseOwner(entry: JobQueueEntry, ownerToken: string): void {
  if (entry.leaseOwner !== ownerToken)
    throw new JobQueueStateError(`Job ${entry.instanceId} is owned by another process`);
}

/** Checks the lease deadline against the supplied clock time.
 * @param entry - Current queue or storage entry.
 * @param now - Current clock time in milliseconds.
 * @returns Whether the lease deadline has elapsed.
 */
export function isLeaseExpired(entry: JobQueueEntry, now: number): boolean {
  return (
    entry.state === "leased" && entry.leaseExpiresAt !== undefined && entry.leaseExpiresAt <= now
  );
}
