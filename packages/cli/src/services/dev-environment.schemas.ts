/** Decodes the private Bun helper response without exposing its values in diagnostics. */
import { Schema } from "effect";

/** A complete in-memory native process environment, never serialized into build artifacts. */
export const developmentEnvironmentSchema = Schema.Record(Schema.String, Schema.String);
