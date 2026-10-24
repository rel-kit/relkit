/**
 * Validates inspection settings once for application authoring and compilation.
 * Pure Result decoding preserves invalid-input evidence without acquiring any
 * resources; runtime session ownership consumes the resolved settings later.
 */
import { Data, Result, Schema } from "effect";
import { InspectorConfigurationInputSchema } from "./inspector-config.schemas.js";
import type { InspectorConfiguration } from "./inspector-config.types.js";

export {
  InspectorConfigurationInputSchema,
  InspectorConfigurationSchema,
} from "./inspector-config.schemas.js";
export type * from "./inspector-config.types.js";

/** Invalid bridge selection, reported before development resource acquisition. */
export class InspectorConfigurationError extends Data.TaggedError("InspectorConfigurationError")<{
  /** Safe correction guidance; never includes application configuration values. */
  readonly message: string;
}> {}

/** Default disabled bridge policy; the standalone UI separately defaults to 3210. */
export const DEFAULT_INSPECTOR_CONFIGURATION: InspectorConfiguration = Object.freeze({
  enabled: false,
  connection: Object.freeze({ host: "127.0.0.1", port: 0 }),
  maxPreviewBytes: 1_048_576,
});

/**
 * Decodes authored input and supplies immutable development bridge defaults.
 * @typeParam Value - Actual boundary input, checked before use.
 * @param value - Optional inspection configuration from authoring or tooling.
 * @returns Resolved policy or an actionable validation failure; performs no I/O.
 */
export function normalizeInspectorConfiguration<Value>(
  value: Value,
): Result.Result<InspectorConfiguration, InspectorConfigurationError> {
  if (value !== null && typeof value === "object" && "port" in value) {
    return Result.fail(
      new InspectorConfigurationError({
        message:
          "Replace inspector.port with inspector.connection.host/port for the bridge; set the UI port with relkit-inspector --port (default 3210).",
      }),
    );
  }
  const decoded = Schema.decodeUnknownResult(InspectorConfigurationInputSchema, {
    onExcessProperty: "error",
  })(value === undefined ? {} : value);
  return Result.mapError(
    Result.map(decoded, (input) =>
      Object.freeze({
        enabled: input.enabled ?? false,
        connection: Object.freeze({
          host: input.connection?.host ?? "127.0.0.1",
          port: input.connection?.port ?? 0,
        }),
        maxPreviewBytes: input.maxPreviewBytes ?? 1_048_576,
      }),
    ),
    () =>
      new InspectorConfigurationError({
        message:
          "Invalid inspector configuration: use enabled (boolean), connection.host (bind host without URL/path), connection.port (integer 0–65535), and positive maxPreviewBytes. Inspection is development-only.",
      }),
  );
}
