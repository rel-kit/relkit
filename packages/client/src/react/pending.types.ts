import type { PendingOperationMetadata } from "relkit/contracts";
import type { JobUnknownOutcome } from "relkit/contracts/jobs";

/** Submission/recovery authority retained from the existing pending API. */
export interface PendingRememberOptions {
  readonly operationId?: string;
  readonly idempotencyKey?: string;
  readonly recovery?: JobUnknownOutcome["recovery"];
  readonly retainRequest?: boolean;
}

/** References persisted with metadata; transmitted inputs remain memory-only. */
export type PendingReferences = Pick<PendingOperationMetadata, "threadId" | "runId">;

/** One browser's pending-operation state; tests create isolated instances. */
export interface PendingOperationService {
  /** Records validated metadata while retaining original input only in opted-in memory.
   * @param scope - Complete application and identity isolation scope.
   * @param kind - Existing submission category.
   * @param resource - Declared job, route or agent key.
   * @param value - Original transmitted request payload.
   * @param references - Existing durable receipt references.
   * @param options - Existing operation identity, reuse and retention policy.
   * @returns The recorded metadata, or a rejection with the original hashing/capacity failure. */
  readonly remember: (
    scope: string,
    kind: PendingOperationMetadata["kind"],
    resource: string,
    value: unknown,
    references: PendingReferences,
    options: PendingRememberOptions,
  ) => Promise<PendingOperationMetadata>;
  /** Replaces persisted metadata without persisting request inputs.
   * @param scope - Complete pending isolation scope.
   * @param value - Existing receipt metadata with its updated outcome.
   * @returns Nothing, after a synchronous best-effort metadata update. */
  readonly update: (scope: string, value: PendingOperationMetadata) => void;
  /** Removes one settled receipt and its memory-only request.
   * @param scope - Complete pending isolation scope.
   * @param id - Existing operation identity.
   * @returns Nothing, after a synchronous state update. */
  readonly forget: (scope: string, id: string) => void;
  /** Lists metadata using the existing selective persistence validation.
   * @param scope - Complete pending isolation scope.
   * @returns A synchronous metadata snapshot. */
  readonly list: (scope: string) => readonly PendingOperationMetadata[];
  /** Reads opted-in memory input without recovering payloads from persisted metadata.
   * @param scope - Complete pending isolation scope.
   * @param id - Existing operation identity.
   * @returns The original input when retained, synchronously. */
  readonly request: (scope: string, id: string) => unknown;
  /** Clears receipt metadata and retained memory input for one isolation scope.
   * @param scope - Complete pending isolation scope.
   * @returns Nothing, after a synchronous state update. */
  readonly clear: (scope: string) => void;
  /** Checks a request digest against stored receipt metadata.
   * @param scope - Complete pending isolation scope.
   * @param id - Existing operation identity.
   * @param value - Original request payload whose digest is compared.
   * @returns The match decision, or a rejection with the original hashing failure. */
  readonly matches: (scope: string, id: string, value: unknown) => Promise<boolean>;
  /** Hashes canonical JSON through the existing WebCrypto boundary.
   * @param value - Original payload whose canonical representation is hashed.
   * @returns The SHA-256 digest, or a rejection with the original serialization/crypto failure. */
  readonly digest: (value: unknown) => Promise<string>;
}
