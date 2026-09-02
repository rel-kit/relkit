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

export interface OtlpOptions {
  readonly endpoint: TextInput;
  readonly headers?: Readonly<Record<string, TextInput>>;
  readonly serviceName?: TextInput;
}

export type OtlpTelemetryExporter = TelemetryExporterDescriptor<"otlp", "otlp", OtlpOptions>;

/** Declares one statically loaded OTLP/HTTP telemetry exporter. */
export function otlp(options: OtlpOptions): OtlpTelemetryExporter {
  if (!record(options)) throw new TypeError("OTLP options are invalid");
  exact(options, ["endpoint", "headers", "serviceName"]);
  return defineTelemetryExporter("otlp", "otlp", {
    endpoint: endpoint(options.endpoint),
    ...(options.headers === undefined ? {} : { headers: headerValues(options.headers) }),
    ...(options.serviceName === undefined
      ? {}
      : { serviceName: text(options.serviceName, "serviceName") }),
  });
}

function endpoint(value: TextInput): TextInput {
  const selected = text(value, "endpoint");
  if (typeof selected !== "string") return selected;
  const url = new URL(selected);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new TypeError("OTLP endpoint must use http or https");
  return selected;
}

function headerValues(value: Readonly<Record<string, TextInput>>) {
  if (!record(value)) throw new TypeError("OTLP headers are invalid");
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, selected]) => {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
          throw new TypeError("OTLP header name is invalid");
        return [name, text(selected, `header ${name}`)];
      }),
  );
}

function text(value: TextInput, name: string): TextInput {
  if (typeof value === "string" && value.trim() !== "" && !/[\0\r\n]/.test(value))
    return value.trim();
  if (
    isBindingValueRef(value) &&
    (value.type === "string" || value.type === "url" || value.type === "secret-string")
  )
    return value as TextReference;
  throw new TypeError(`OTLP ${name} must be non-empty text or a named text value`);
}

function exact(value: object, allowed: readonly string[]): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw new TypeError(`Unknown OTLP option "${unknown}"`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
