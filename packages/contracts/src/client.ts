import type { JsonValue } from "./json.js";
import type { JobUnknownOutcome } from "./jobs-access.js";

declare const operationIdBrand: unique symbol;

/** A UUIDv7 validated by Relkit for bounded idempotency. */
export type OperationId = string & { readonly [operationIdBrand]: "OperationId" };

export interface ExpectedClientIdentity {
  readonly identityScope: string;
  readonly sessionEpoch: string;
}

export interface JobsClientProtocol {
  readonly protocol: "relkit.jobs";
  readonly version: 1;
  readonly capabilities?: JsonValue;
}

export interface ClientIdentityDocument extends ExpectedClientIdentity {
  readonly protocol: "relkit.client-identity";
  readonly version: 1;
  readonly applicationId: string;
  readonly publicFingerprint: string;
  readonly issuedAt: string;
  readonly jobs?: JobsClientProtocol;
}

export type PendingOperationKind =
  | "mutation"
  | "agent-run"
  | "agent-control"
  | "continuation"
  | "job-trigger";

export interface PendingOperationMetadata {
  readonly operationId: OperationId;
  readonly kind: PendingOperationKind;
  readonly resourceId: string;
  readonly threadId?: string;
  readonly runId?: string;
  readonly requestDigest: string;
  readonly submittedAt: string;
  readonly state: "submitted" | "accepted" | "unknown";
  readonly idempotencyKey?: string;
  readonly recovery?: JobUnknownOutcome["recovery"];
}

export type ReceiptLookup<Receipt> =
  | { readonly status: "found"; readonly receipt: Receipt }
  | { readonly status: "not-found"; readonly providerEpoch: string }
  | { readonly status: "expired"; readonly expiredAt: string }
  | { readonly status: "state-lost"; readonly previousEpoch?: string };

export const CLIENT_IDENTITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization, Origin",
  "X-Content-Type-Options": "nosniff",
});
