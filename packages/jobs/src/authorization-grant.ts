import type { JobAccessGrant, JobAccessRequest } from "@relkit/contracts/jobs";
import { Clock, Effect, Result } from "effect";
import { isRfc3339InstantEffect } from "./instant-validation.js";
import { JobAuthorizationError } from "./authorization-errors.js";
import { JobAuthorizationFailure } from "./authorization-failure.js";
import { observeJobs } from "./jobs-observability.js";
import type { TrustedJobScope } from "./authorization.types.js";

/** Validates a grant against a trusted tenant scope and current time.
 * @param value - Untrusted policy result.
 * @param trusted - Authoritative tenant context.
 * @param now - Optional deterministic epoch milliseconds.
 * @returns An Effect of a validated grant or JobAuthorizationFailure.
 * @example Effect.runPromise(assertJobGrantEffect({ scope: "tenant:a" }, trusted));
 */
export const assertJobGrantEffect = Effect.fn("Jobs.assertJobGrant")(
  function* (value: unknown, trusted: TrustedJobScope, now?: number) {
    const deny = () => Effect.fail(new JobAuthorizationFailure({ reason: "grant" }));
    if (value === null || typeof value !== "object" || Array.isArray(value)) return yield* deny();
    const grant = value as Record<string, unknown>;
    if (Object.keys(grant).some((key) => key !== "scope" && key !== "expiresAt"))
      return yield* deny();
    if (
      typeof grant.scope !== "string" ||
      !(grant.scope === trusted.scope || grant.scope.startsWith(`${trusted.scope}:`))
    )
      return yield* deny();
    yield* boundedTextEffect(grant.scope);
    if (grant.expiresAt !== undefined) {
      if (typeof grant.expiresAt !== "string") return yield* deny();
      yield* boundedTextEffect(grant.expiresAt);
      if (!(yield* isRfc3339InstantEffect(grant.expiresAt))) return yield* deny();
      const expiry = Date.parse(grant.expiresAt);
      const current = now === undefined ? yield* Clock.currentTimeMillis : now;
      if (!Number.isFinite(expiry) || expiry <= current) return yield* deny();
    }
    return Object.freeze({
      scope: grant.scope,
      ...(grant.expiresAt === undefined ? {} : { expiresAt: grant.expiresAt }),
    }) as JobAccessGrant;
  },
  (effect) => observeJobs("authorization.grant", effect),
);

/** Synchronous compatibility assertion for policy grants.
 * @param value - Untrusted policy result.
 * @param trusted - Authoritative tenant context.
 * @param now - Optional epoch milliseconds.
 * @returns Nothing when the grant is valid.
 * @throws JobAuthorizationError for an invalid or expired grant.
 * @example assertJobGrant({ scope: "tenant:a" }, trusted);
 */
export function assertJobGrant(
  value: unknown,
  trusted: TrustedJobScope,
  now = Date.now(),
): asserts value is JobAccessGrant {
  const result = Effect.runSync(Effect.result(assertJobGrantEffect(value, trusted, now)));
  if (Result.isFailure(result)) throw new JobAuthorizationError();
}

/** Validates a grant and the requested operation in Effect.
 * @param grant - Candidate access grant.
 * @param request - Client operation request.
 * @param trusted - Authoritative tenant context.
 * @param now - Optional deterministic epoch milliseconds.
 * @returns An Effect of void or JobAuthorizationFailure.
 * @example Effect.runPromise(assertAuthorizedOperationEffect(grant, request, trusted));
 */
export const assertAuthorizedOperationEffect = Effect.fn("Jobs.assertAuthorizedOperation")(
  function* (
    grant: JobAccessGrant,
    request: JobAccessRequest,
    trusted: TrustedJobScope,
    now?: number,
  ) {
    yield* assertJobGrantEffect(grant, trusted, now);
    if (request.jobId.length === 0 || request.operation.length === 0)
      return yield* Effect.fail(new JobAuthorizationFailure({ reason: "operation" }));
  },
  (effect) => observeJobs("authorization.operation", effect),
);

/** Synchronous compatibility assertion for an authorized operation.
 * @param grant - Candidate access grant.
 * @param request - Client operation request.
 * @param trusted - Authoritative tenant context.
 * @param now - Optional epoch milliseconds.
 * @returns Nothing when authorized.
 * @throws JobAuthorizationError for an invalid grant or request.
 * @example assertAuthorizedOperation(grant, request, trusted);
 */
export function assertAuthorizedOperation(
  grant: JobAccessGrant,
  request: JobAccessRequest,
  trusted: TrustedJobScope,
  now = Date.now(),
): void {
  const result = Effect.runSync(
    Effect.result(assertAuthorizedOperationEffect(grant, request, trusted, now)),
  );
  if (Result.isFailure(result)) throw new JobAuthorizationError();
}

/** Checks bounded trusted and grant strings.
 * @param value - Untrusted candidate text.
 * @returns An Effect of void or JobAuthorizationFailure.
 * @example Effect.runPromise(boundedTextEffect("tenant:a"));
 */
export const boundedTextEffect = Effect.fn("Jobs.boundedAuthorizationText")(function* (
  value: unknown,
) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 256
  )
    return yield* Effect.fail(new JobAuthorizationFailure({ reason: "boundedText" }));
});
