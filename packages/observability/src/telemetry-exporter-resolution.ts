import { deepFreeze, isStableId, serializeJson, type JsonValue } from "@relkit/contracts";
import type { TelemetryExporterDescriptor } from "./telemetry-config.js";
import type {
  TelemetryExporterFactoryContext,
  TelemetryExporterRuntime,
} from "./telemetry-exporter-types.js";

export function telemetryExporterFactory(
  descriptor: TelemetryExporterDescriptor,
  modules: readonly { readonly module: unknown }[],
): (context: TelemetryExporterFactoryContext) => Promise<TelemetryExporterRuntime> {
  const matched = modules
    .map((entry) => entry.module)
    .filter((module) => matches(module, descriptor));
  if (matched.length !== 1) throw new TypeError("Telemetry exporter runtime metadata is invalid.");
  const factory = (matched[0] as Record<string, unknown>).createTelemetryExporter;
  if (typeof factory !== "function") throw new TypeError("Telemetry exporter runtime is invalid.");
  return async (context) => {
    const runtime = await factory(context);
    if (!isRuntime(runtime)) throw new TypeError("Telemetry exporter runtime is invalid.");
    return runtime;
  };
}

export function resolveTelemetryExporterConfiguration(
  exporter: string,
  value: object,
  values: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, JsonValue>> {
  return frozen(resolveValue(exporter, value, values)) as Readonly<Record<string, JsonValue>>;
}

function matches(module: unknown, descriptor: TelemetryExporterDescriptor): boolean {
  if (!record(module) || !record(module.runtimeIntegration)) return false;
  const metadata = module.runtimeIntegration;
  return (
    metadata.integrationId === descriptor.integrationId &&
    Array.isArray(metadata.registrations) &&
    metadata.registrations.some(
      (registration) =>
        record(registration) &&
        registration.capability === "telemetry" &&
        registration.adapterId === descriptor.adapterId &&
        registration.protocolVersion === descriptor.protocolVersion,
    )
  );
}

function resolveValue(
  exporter: string,
  value: unknown,
  values: Readonly<Record<string, unknown>>,
): JsonValue {
  if (bindingRef(value)) {
    const resolved = values[value.name];
    if (resolved === undefined)
      throw new TypeError(
        `Telemetry exporter "${exporter}" requires binding value "${value.name}".`,
      );
    return frozen(resolved);
  }
  if (Array.isArray(value)) return value.map((entry) => resolveValue(exporter, entry, values));
  if (record(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveValue(exporter, entry, values)]),
    );
  return frozen(value);
}

function bindingRef(value: unknown): value is { readonly name: string } {
  if (!record(value)) return false;
  const types = ["string", "number", "boolean", "port", "url", "json", "secret-string"];
  return (
    Reflect.ownKeys(value).length === 4 &&
    value.kind === "binding-value-ref" &&
    isStableId(value.name) &&
    types.includes(String(value.type)) &&
    value.sensitive === (value.type === "secret-string")
  );
}

function isRuntime(value: unknown): value is TelemetryExporterRuntime {
  return record(value) && typeof value.exportRecord === "function";
}

function frozen(value: unknown): JsonValue {
  return deepFreeze(JSON.parse(serializeJson(value)) as JsonValue);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
