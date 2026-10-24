/**
 * Shares data-only inspection selection between application authoring and the
 * compiler. These schemas describe a development bridge, never a UI process;
 * decoding acquires no listener, storage, credentials, or optional tool.
 */
import { Schema } from "effect";

/** Bind address without URL syntax, whitespace, or request-path components. */
export const InspectorConnectionHost = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9.:_-]+$/));

/** TCP bind port; zero requests an available port from the operating system. */
export const InspectorConnectionPort = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 65_535 }),
);

/** Optional authored bridge settings, with excess keys rejected by the decoder. */
export const InspectorConfigurationInputSchema = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  connection: Schema.optionalKey(
    Schema.Struct({
      host: Schema.optionalKey(InspectorConnectionHost),
      port: Schema.optionalKey(InspectorConnectionPort),
    }),
  ),
  maxPreviewBytes: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0))),
});

/** Fully defaulted bridge policy used by compilation and session acquisition. */
export const InspectorConfigurationSchema = Schema.Struct({
  enabled: Schema.Boolean,
  connection: Schema.Struct({
    host: InspectorConnectionHost,
    port: InspectorConnectionPort,
  }),
  maxPreviewBytes: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
});
