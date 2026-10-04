import type { PendingOperationMetadata } from "@relkit/contracts";
import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import type { Effect } from "effect";

/** Submission/recovery authority retained from the existing pending API. */
export interface PendingRememberOptions {
  readonly operationId?: string;
  readonly idempotencyKey?: string;
  readonly recovery?: JobUnknownOutcome["recovery"];
  readonly retainRequest?: boolean;
}

/** References persisted with metadata; transmitted inputs remain memory-only. */
export type PendingReferences = Pick<PendingOperationMetadata, "threadId" | "runId">;

/** One browser's pending-operation state with isolated live/test implementations. */
export interface PendingOperationService {
  /** Records validated metadata while retaining original input only in opted-in memory.
   * @param scope - Complete application and identity isolation scope.
   * @param kind - Existing submission category.
   * @param resource - Declared job, route or agent key.
   * @param value - Original transmitted request payload.
   * @param references - Existing durable receipt references.
   * @param options - Existing operation identity, reuse and retention policy.
   * @returns Lazy observed metadata creation or the original hashing/capacity failure. */
  readonly remember: (
    scope: string,
    kind: PendingOperationMetadata["kind"],
    resource: string,
    value: unknown,
    references: PendingReferences,
    options: PendingRememberOptions,
  ) => Effect.Effect<PendingOperationMetadata, unknown>;
  /** Replaces persisted metadata without persisting request inputs.
   * @param scope - Complete pending isolation scope.
   * @param value - Existing receipt metadata with its updated outcome.
   * @returns A synchronous observed best-effort metadata update. */
  readonly update: (scope: string, value: PendingOperationMetadata) => Effect.Effect<void>;
  /** Removes one settled receipt and its memory-only request.
   * @param scope - Complete pending isolation scope.
   * @param id - Existing operation identity.
   * @returns A synchronous observed state update. */
  readonly forget: (scope: string, id: string) => Effect.Effect<void>;
  /** Lists metadata using the existing selective persistence validation.
   * @param scope - Complete pending isolation scope.
   * @returns A synchronous observed metadata snapshot. */
  readonly list: (scope: string) => Effect.Effect<readonly PendingOperationMetadata[]>;
  /** Reads opted-in memory input without recovering payloads from persisted metadata.
   * @param scope - Complete pending isolation scope.
   * @param id - Existing operation identity.
   * @returns A synchronous observed original input when retained. */
  readonly request: (scope: string, id: string) => Effect.Effect<unknown>;
  /** Clears receipt metadata and retained memory input for one isolation scope.
   * @param scope - Complete pending isolation scope.
   * @returns A synchronous observed state update. */
  readonly clear: (scope: string) => Effect.Effect<void>;
  /** Checks a request digest against stored receipt metadata.
   * @param scope - Complete pending isolation scope.
   * @param id - Existing operation identity.
   * @param value - Original request payload whose digest is compared.
   * @returns A lazy observed match decision or the original hashing failure. */
  readonly matches: (scope: string, id: string, value: unknown) => Effect.Effect<boolean, unknown>;
  /** Hashes canonical JSON through the existing WebCrypto boundary.
   * @param value - Original payload whose canonical representation is hashed.
   * @returns A lazy observed SHA-256 digest or the original serialization/crypto failure. */
  readonly digest: (value: unknown) => Effect.Effect<string, unknown>;
}
