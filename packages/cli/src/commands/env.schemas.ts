import { Schema } from "effect";

/** Opaque declaration marker; config owns validation of builders and callbacks. */
export const environmentDefinitionMarker = Schema.Struct({
  kind: Schema.Literal("env-definition"),
});
