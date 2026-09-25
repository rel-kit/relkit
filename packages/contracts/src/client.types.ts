import type { JsonValue } from "./json.types.js";
import type { JobUnknownOutcome } from "./jobs-access.js";

declare const operationIdBrand: unique symbol;

/** A UUIDv7 validated by Relkit for bounded idempotency. */
export type OperationId = string & { readonly [operationIdBrand]: "OperationId" };

/** Identity scope and epoch expected by a client request. */
export interface ExpectedClientIdentity {
  readonly identityScope: string;
  readonly sessionEpoch: string;
}

/** Jobs protocol advertised in a client identity document. */
export interface JobsClientProtocol {
  readonly protocol: "relkit.jobs";
  readonly version: 1;
  readonly capabilities?: JsonValue;
}

/** Versioned identity document sent to clients. */
export interface ClientIdentityDocument extends ExpectedClientIdentity {
  readonly protocol: "relkit.client-identity";
  readonly version: 1;
  readonly applicationId: string;
  readonly publicFingerprint: string;
  readonly issuedAt: string;
  readonly jobs?: JobsClientProtocol;
}

/** Mutations whose outcome can be recovered by operation ID. */
export type PendingOperationKind =
  "mutation" | "agent-run" | "agent-control" | "continuation" | "job-trigger";

/** Durable metadata for a submitted client operation. */
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

/** Outcome of looking up a previously submitted operation. */
export type ReceiptLookup<Receipt> =
  | { readonly status: "found"; readonly receipt: Receipt }
  | { readonly status: "not-found"; readonly providerEpoch: string }
  | { readonly status: "expired"; readonly expiredAt: string }
  | { readonly status: "state-lost"; readonly previousEpoch?: string };
