import { normalizeId } from "@relkit/contracts";
import { assertTime, JobQueueStateError } from "./queue-utils.js";
import type {
  JobQueueEntry,
  JobQueueLeaseOptions,
  JobQueueTransitionOptions,
} from "./queue-utils.js";

export const DEFAULT_LEASE_DURATION_MS = 30_000;

export function normalizeOwnerToken(value: string): string {
  return normalizeId(value);
}

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

export function assertLeaseDuration(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new JobQueueStateError("Lease duration is invalid");
}

export function assertLeaseOwner(entry: JobQueueEntry, ownerToken: string): void {
  if (entry.leaseOwner !== ownerToken)
    throw new JobQueueStateError(`Job ${entry.instanceId} is owned by another process`);
}

export function isLeaseExpired(entry: JobQueueEntry, now: number): boolean {
  return (
    entry.state === "leased" && entry.leaseExpiresAt !== undefined && entry.leaseExpiresAt <= now
  );
}
