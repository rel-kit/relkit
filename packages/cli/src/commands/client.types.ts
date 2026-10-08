import type { Schema } from "effect";
import type { ContractProcedureDocument } from "@relkit/client-generator";
import type { clientDocumentSchema } from "./client.schemas.js";

/** Client document derived from its runtime schema, retaining portable extra fields. */
export type ContractDocument = Schema.Schema.Type<typeof clientDocumentSchema>;

/** Parsed pull/check inputs after URL and option validation. */
export interface ClientOptions {
  readonly baseUrl: string;
  readonly out: string;
}

/** Accepted generator projection, validated before the first output write. */
export interface ValidatedClientDocument {
  readonly procedures: readonly ContractProcedureDocument[];
  readonly registry: string;
}

/** Public pull result in its stable JSON/reporting shape. */
export interface ClientPullResult {
  readonly directory: string;
  readonly graphHash: string;
  readonly files: readonly string[];
}

/** Public compatibility-check result. */
export interface ClientCheckResult {
  readonly directory: string;
  readonly publicFingerprint: string;
}
