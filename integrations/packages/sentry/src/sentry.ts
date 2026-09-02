import {
  defineTelemetryExporter,
  type TelemetryExporterDescriptor,
} from "@relkit/observability/telemetry";
import { isBindingValueRef, type BindingValueRef } from "@relkit/provider";

type TextReference =
  | BindingValueRef<string, string, "string">
  | BindingValueRef<string, URL, "url">
  | BindingValueRef<string, string, "secret-string">;
type TextInput = string | TextReference;

export interface SentryOptions {
  readonly dsn: TextInput;
  readonly environment?: TextInput;
  readonly release?: TextInput;
}

export type SentryTelemetryExporter = TelemetryExporterDescriptor<
  "sentry",
  "sentry",
  SentryOptions
>;

/** Declares one statically loaded Sentry telemetry exporter. */
export function sentry(options: SentryOptions): SentryTelemetryExporter {
  if (!record(options)) throw new TypeError("Sentry options are invalid");
  exact(options, ["dsn", "environment", "release"]);
  return defineTelemetryExporter("sentry", "sentry", {
    dsn: text(options.dsn, "dsn"),
    ...(options.environment === undefined
      ? {}
      : { environment: text(options.environment, "environment") }),
    ...(options.release === undefined ? {} : { release: text(options.release, "release") }),
  });
}

function text(value: TextInput, name: string): TextInput {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (
    isBindingValueRef(value) &&
    (value.type === "string" || value.type === "url" || value.type === "secret-string")
  )
    return value as TextReference;
  throw new TypeError(`Sentry ${name} must be non-empty text or a named text value`);
}

function exact(value: object, allowed: readonly string[]): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw new TypeError(`Unknown Sentry option "${unknown}"`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
