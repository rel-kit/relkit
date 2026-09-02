import { deepFreeze, serializeJson, type JsonValue } from "@relkit/contracts";
import type { ProviderBindingNode } from "@relkit/graph";
import {
  resolveProviderConnection,
  type BindingValueRef,
  type BindingValueType,
  type ProviderConnectionValues,
} from "@relkit/provider";

type ScopedValues = Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;

export interface ProviderBindingValueSources {
  readonly values?: Readonly<Record<string, JsonValue>>;
  readonly local?: ScopedValues;
  readonly infrastructure?: ScopedValues;
}

export interface ResolvedProviderBindingConfiguration {
  readonly behavior: JsonValue;
  readonly connection: Readonly<Record<string, JsonValue>>;
}

export function resolveProviderBindingConfiguration(
  binding: ProviderBindingNode,
  sources: ProviderBindingValueSources = {},
): ResolvedProviderBindingConfiguration {
  const connection: Record<string, ProviderConnectionValues[string]> = {
    ...binding.adapter.connection,
  };
  for (const named of binding.namedValues) {
    connection[named.field] = {
      kind: "binding-value-ref",
      name: named.name,
      type: named.type as BindingValueType,
      sensitive: named.sensitive,
    } as BindingValueRef;
  }
  const resolved = resolveProviderConnection(
    {
      capability: { id: binding.capability },
      connectionContract: { fields: binding.adapter.connectionContract },
      connection,
    },
    {
      bindingId: binding.id,
      profile: binding.profile,
      ...(sources.values === undefined ? {} : { values: sources.values }),
      ...scoped("local", binding.id, sources.local),
      ...scoped("infrastructure", binding.id, sources.infrastructure),
    },
  );
  return frozen({ behavior: binding.adapter.behavior, connection: resolved });
}

function scoped<Name extends "local" | "infrastructure">(
  name: Name,
  bindingId: string,
  source: ScopedValues | undefined,
): { readonly [Key in Name]?: Readonly<Record<string, JsonValue>> } {
  return source !== undefined && Object.hasOwn(source, bindingId)
    ? ({ [name]: source[bindingId] } as {
        readonly [Key in Name]: Readonly<Record<string, JsonValue>>;
      })
    : {};
}

function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}
