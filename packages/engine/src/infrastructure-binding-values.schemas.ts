import { Schema } from "effect";

/** Deployment connection outputs grouped by binding identity; keys are checked by the decoder. */
export const InfrastructureBindingValues = Schema.Record(Schema.String, Schema.JsonObject);
