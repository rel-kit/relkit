import type { EnvShape } from "@relkit/config";
import { createDescriptorBase, deepFreeze, serializeJson } from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import {
  normalizeTelemetryConfiguration,
  type TelemetryExporterMap,
} from "@relkit/observability/telemetry";
import {
  defineProviderCapability,
  normalizeProviderProfiles,
  type NormalizedProviderProfiles,
  type ProviderSourceInput,
} from "@relkit/provider";
import { isEnvDefinition } from "./app-validation.js";
import {
  APP_PROVIDER_CAPABILITIES,
  type ApplicationDescriptor,
  type AppProviderCapability,
  type AppProviderDefaults,
  type AppProviderInputs,
  type DefineAppOptions,
} from "./define-app-types.js";

export * from "./define-app-types.js";

const OPTION_KEYS = new Set([
  "id",
  "title",
  "description",
  "tags",
  "env",
  "defaults",
  "telemetry",
  "server",
  "inspector",
  "deployment",
  ...APP_PROVIDER_CAPABILITIES,
]);

/**
 * Defines one immutable application topology.
 *
 * @example
 * ```ts
 * import { defineApp, defineEnv } from "@relkit/app";
 * export default defineApp({
 *   id: "orders-api",
 *   env: defineEnv({}),
 *   server: { port: 3000 },
 *   inspector: { port: 3210 },
 * });
 * ```
 * @category Application
 * @since 0.2.0
 */
export function defineApp<
  const Shape extends EnvShape,
  const Providers extends AppProviderInputs,
  const Exporters extends TelemetryExporterMap = TelemetryExporterMap,
>(
  options: DefineAppOptions<Shape, Providers, Exporters>,
): ApplicationDescriptor<Shape, Providers, Exporters> {
  if (!isRecord(options) || !isEnvDefinition(options.env))
    throw new TypeError("RELKIT app requires an environment definition");
  for (const key of Object.keys(options))
    if (!OPTION_KEYS.has(key)) throw new TypeError(`Unknown defineApp option "${key}"`);
  const providers = normalizeProviders(options);
  const defaults = normalizeDefaults(providers, options.defaults);
  const base = createDescriptorBase("app", options.id ?? createUnboundIdentity(), options);
  return deepFreeze({
    ...base,
    env: options.env,
    ...providers,
    defaults,
    ...(options.telemetry === undefined
      ? {}
      : { telemetry: normalizeTelemetryConfiguration(options.telemetry) }),
    ...(options.server === undefined ? {} : { server: copy(options.server) }),
    ...(options.inspector === undefined ? {} : { inspector: copy(options.inspector) }),
    ...(options.deployment === undefined ? {} : { deployment: copy(options.deployment) }),
  }) as unknown as ApplicationDescriptor<Shape, Providers, Exporters>;
}

function normalizeProviders(
  options: AppProviderInputs,
): Partial<Record<AppProviderCapability, NormalizedProviderProfiles>> {
  const result: Partial<Record<AppProviderCapability, NormalizedProviderProfiles>> = {};
  for (const capability of APP_PROVIDER_CAPABILITIES) {
    const input = options[capability];
    if (input !== undefined)
      result[capability] = normalizeProviderProfiles(
        defineProviderCapability(capability),
        input as ProviderSourceInput | Readonly<Record<string, ProviderSourceInput>>,
      );
  }
  return result;
}

function normalizeDefaults<Providers extends AppProviderInputs>(
  providers: Partial<Record<AppProviderCapability, NormalizedProviderProfiles>>,
  defaults: AppProviderDefaults<Providers> | undefined,
): AppProviderDefaults<Providers> {
  const result: Partial<Record<AppProviderCapability, string>> = {};
  for (const [capability, selected] of Object.entries(defaults ?? {})) {
    if (!APP_PROVIDER_CAPABILITIES.includes(capability as AppProviderCapability))
      throw new TypeError(`Unknown default capability "${capability}"`);
    const profiles = providers[capability as AppProviderCapability]?.profiles;
    if (typeof selected !== "string" || profiles?.[selected] === undefined)
      throw new TypeError(`defaults.${capability} must reference a configured profile`);
    result[capability as AppProviderCapability] = selected;
  }
  return copy(result) as AppProviderDefaults<Providers>;
}

function copy<Value>(value: Value): Value {
  return JSON.parse(serializeJson(value)) as Value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
