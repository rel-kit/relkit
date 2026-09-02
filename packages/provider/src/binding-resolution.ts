import { deepFreeze, normalizeId, serializeJson, type JsonValue } from "@relkit/contracts";
import { isBindingValueRef } from "./binding-values.js";
import type { ProviderConnectionField, ProviderConnectionValues } from "./protocol-types.js";

export type ProviderBindingResolutionCode =
  "CONFLICTING_CONNECTION_VALUE" | "MISSING_CONNECTION_VALUE" | "UNKNOWN_CONNECTION_OUTPUT";

export class ProviderBindingResolutionError extends TypeError {
  readonly code: ProviderBindingResolutionCode;
  readonly bindingId: string;
  readonly field: string;

  constructor(
    code: ProviderBindingResolutionCode,
    bindingId: string,
    field: string,
    reason: string,
  ) {
    super(`${bindingId} connection field "${field}" ${reason}`);
    this.name = "ProviderBindingResolutionError";
    this.code = code;
    this.bindingId = bindingId;
    this.field = field;
  }
}

export interface ResolveProviderConnectionOptions {
  readonly profile: string;
  readonly bindingId?: string;
  readonly local?: Readonly<Record<string, JsonValue>>;
  readonly infrastructure?: Readonly<Record<string, JsonValue>>;
  readonly values?: Readonly<Record<string, JsonValue>>;
}

export interface ProviderConnectionDescriptor {
  readonly capability: Readonly<{ readonly id: string }>;
  readonly connectionContract: Readonly<{
    readonly fields: Readonly<Record<string, ProviderConnectionField>>;
  }>;
  readonly connection: ProviderConnectionValues;
}

export function resolveProviderConnection(
  adapter: ProviderConnectionDescriptor,
  options: ResolveProviderConnectionOptions,
): Readonly<Record<string, JsonValue>> {
  const bindingId = options.bindingId ?? `${adapter.capability.id}.${normalizeId(options.profile)}`;
  assertDeclaredOutputs(bindingId, adapter, "local", options.local);
  assertDeclaredOutputs(bindingId, adapter, "infrastructure", options.infrastructure);
  const result: Record<string, JsonValue> = {};
  for (const [name, field] of Object.entries(adapter.connectionContract.fields)) {
    const resolved = resolveField(bindingId, name, field, adapter, options);
    if (resolved !== undefined) result[name] = resolved;
  }
  return deepFreeze(JSON.parse(serializeJson(result)) as Record<string, JsonValue>);
}

function resolveField(
  bindingId: string,
  name: string,
  field: ProviderConnectionField,
  adapter: ProviderConnectionDescriptor,
  options: ResolveProviderConnectionOptions,
): JsonValue | undefined {
  const local = own(options.local, name);
  const infrastructure = own(options.infrastructure, name);
  const authored = own(adapter.connection, name);
  if ((local || infrastructure) && authored && field.authoredValue === "fixed")
    throw new ProviderBindingResolutionError(
      "CONFLICTING_CONNECTION_VALUE",
      bindingId,
      name,
      `conflicts with ${local ? "local" : "infrastructure"} output`,
    );
  if (local) return options.local![name];
  if (infrastructure) return options.infrastructure![name];
  if (authored) {
    const value = adapter.connection[name];
    if (!isBindingValueRef(value)) return value;
    if (own(options.values, value.name)) return options.values![value.name];
    if (own(field, "default")) return field.default;
    if (field.required)
      throw new ProviderBindingResolutionError(
        "MISSING_CONNECTION_VALUE",
        bindingId,
        name,
        `requires binding value "${value.name}"`,
      );
    return undefined;
  }
  if (own(field, "default")) return field.default;
  if (field.required)
    throw new ProviderBindingResolutionError(
      "MISSING_CONNECTION_VALUE",
      bindingId,
      name,
      "is required",
    );
  return undefined;
}

function assertDeclaredOutputs(
  bindingId: string,
  adapter: ProviderConnectionDescriptor,
  source: "local" | "infrastructure",
  outputs: Readonly<Record<string, JsonValue>> | undefined,
): void {
  if (outputs === undefined) return;
  for (const name of Object.keys(outputs))
    if (!own(adapter.connectionContract.fields, name))
      throw new ProviderBindingResolutionError(
        "UNKNOWN_CONNECTION_OUTPUT",
        bindingId,
        name,
        `is not declared for ${source} output`,
      );
}

function own(value: object | undefined, key: PropertyKey): boolean {
  return value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
}
