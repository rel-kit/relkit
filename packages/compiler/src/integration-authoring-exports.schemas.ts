/** Validates exact authoring selections in integration package metadata without granting other public subpaths. */
import { Schema } from "effect";

/** Existing single-export metadata and explicit multi-leaf selections share the same authority. */
export const IntegrationAuthoringExports = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String),
]);
