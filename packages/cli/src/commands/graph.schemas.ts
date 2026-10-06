import { Schema } from "effect";

/** Untrusted JSON object boundary; the graph package owns full graph validation. */
export const graphObjectSchema = Schema.Record(Schema.String, Schema.Unknown);
