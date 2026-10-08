import { Schema } from "effect";

/** Validates a module namespace without copying it or detaching its live export bindings. */
export const moduleNamespaceSchema = Schema.Record(Schema.String, Schema.Unknown);
