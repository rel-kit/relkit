import { deepFreeze, serializeJson, type JsonValue } from "@relkit/contracts";
import type {
  InfrastructureProviderSource,
  IntegrationReference,
  LocalProviderSource,
  NormalizedProviderSource,
  ProviderAccess,
  ProviderAdapter,
  ProviderBindingSource,
  ProviderSourceInput,
} from "./protocol-types.js";

/**
 * Adds an adapter's declared local recipe without starting it.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineLocalProviderSource<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
): LocalProviderSource<Adapter> {
  assertAdapter(adapter);
  if (adapter.localRecipe === undefined)
    throw new TypeError(`${label(adapter)} does not declare a local recipe`);
  return frozen({ kind: "provider-local-source", adapter }) as LocalProviderSource<Adapter>;
}

/**
 * Adds an infrastructure release source and explicit access metadata.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineInfrastructureProviderSource<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
  integration: IntegrationReference,
  options: JsonValue,
  access?: ProviderAccess,
): InfrastructureProviderSource<Adapter> {
  assertAdapter(adapter);
  if (adapter.localRecipe === undefined)
    throw new TypeError(`${label(adapter)} does not declare a default local recipe`);
  return frozen({
    kind: "provider-infrastructure-source",
    adapter,
    integration,
    options,
    ...(access === undefined ? {} : { access }),
  }) as InfrastructureProviderSource<Adapter>;
}

export function normalizeProviderSource<const Adapter extends ProviderAdapter>(
  input: ProviderSourceInput<Adapter>,
): NormalizedProviderSource<Adapter> {
  if (isRecord(input) && input.kind === "provider-adapter") {
    assertAdapter(input);
    assertConnected(input);
    return normalized(input, { kind: "connected" });
  }
  if (isRecord(input) && isRecord(input.adapter)) assertAdapter(input.adapter);
  if (!isRecord(input) || !isAdapter(input.adapter))
    throw new TypeError("Provider source wrappers cannot be nested");
  if (input.kind === "provider-local-source") {
    const source: ProviderBindingSource = isConfigured(input.adapter)
      ? { kind: "connected" }
      : { kind: "local-only" };
    return normalized(input.adapter, source, input.adapter.localRecipe);
  }
  if (input.kind === "provider-infrastructure-source")
    return normalized(
      input.adapter,
      {
        kind: "infrastructure",
        integrationId: input.integration.integrationId,
        options: input.options,
      },
      input.adapter.localRecipe,
      input.access?.value,
    );
  throw new TypeError("Invalid provider source descriptor");
}

function normalized<Adapter extends ProviderAdapter>(
  adapter: Adapter,
  source: ProviderBindingSource,
  local?: Adapter["localRecipe"],
  access?: JsonValue,
): NormalizedProviderSource<Adapter> {
  return frozen({
    kind: "normalized-provider-source",
    adapter,
    source,
    ...(local === undefined ? {} : { local }),
    ...(access === undefined ? {} : { access }),
  }) as NormalizedProviderSource<Adapter>;
}

function assertConnected(adapter: ProviderAdapter): void {
  const missing = Object.entries(adapter.connectionContract.fields)
    .filter(
      ([name, field]) =>
        field.required &&
        !Object.prototype.hasOwnProperty.call(adapter.connection, name) &&
        !Object.prototype.hasOwnProperty.call(field, "default"),
    )
    .map(([name]) => name);
  if (missing.length > 0)
    throw new TypeError(`${label(adapter)} is missing connection fields: ${missing.join(", ")}`);
}

function isConfigured(adapter: ProviderAdapter): boolean {
  try {
    assertConnected(adapter);
    return true;
  } catch {
    return false;
  }
}

function assertAdapter(value: unknown): asserts value is ProviderAdapter {
  if (isRecord(value) && value.kind === "provider-adapter" && value.protocolVersion !== 1)
    throw new TypeError(
      `Provider protocol version ${String(value.protocolVersion)} is unsupported; rewrite the app with current integration constructors.`,
    );
  if (!isAdapter(value)) throw new TypeError("Provider source wrappers cannot be nested");
}

function isAdapter(value: unknown): value is ProviderAdapter {
  return isRecord(value) && value.kind === "provider-adapter" && value.protocolVersion === 1;
}

function label(adapter: ProviderAdapter): string {
  return `${adapter.capability.id}.${adapter.adapterId}`;
}

function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
