/** Supplies scoped fixture identities, timestamped operation IDs and canonical validated JSON digests. */
import type { AgentRequestScope } from "@relkit/contracts";
import { canonicalJson } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime";
import { createHash } from "node:crypto";
import { Schema } from "effect";
/**
 * Builds the fixed caller identity for a freshly observed provider epoch.
 * @param providerEpoch - Epoch read from the fixture provider.
 * @returns The fixed caller scope bound to the supplied provider epoch.
 */
export function baseScope(providerEpoch: string): AgentRequestScope {
  return {
    applicationId: "app",
    environment: "test",
    profile: "default",
    providerEpoch,
    agentId: "assistant",
    ownerScope: "owner",
    authorizationGrantId: "grant",
    identityScope: "principal",
    sessionEpoch: "session",
  };
}

/**
 * Supplies the exact generation and protocol identity used by native fixture runs.
 * @returns The fixed generation owner shared by fixture run and claim requests.
 */
export function owner() {
  return {
    generationId: "generation-a",
    publicFingerprint: "fp",
    protocolVersion: 1,
    schemaVersion: 1,
    providerScope: "default",
  };
}

/**
 * Creates a UUIDv7 whose age distinguishes the scenario operation.
 * @param last - Millisecond age of the generated operation ID.
 * @returns A fresh UUIDv7 with the requested age.
 */
export function operationId(last: number) {
  return createOperationId(Date.now() - last);
}

/**
 * Computes the fixture lease or receipt expiration timestamp.
 * @param days - Number of days after the current clock for the lease or receipt deadline.
 * @returns An ISO timestamp for the requested fixture deadline.
 */
export function future(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * Decodes fixture JSON before computing its canonical SHA-256 digest.
 * @typeParam Value - Inferred fixture input decoded as JSON before domain use.
 * @param value - Fixture JSON value decoded before canonical hashing.
 * @returns The validated canonical JSON digest prefixed with sha256.
 */
export function digest<Value>(value: Value): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(Schema.decodeUnknownSync(Schema.Json)(value)))
    .digest("hex")}`;
}
