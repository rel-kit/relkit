import { deepFreeze, serializeJson, type JsonValue } from "@relkit/contracts";
import type { ProviderBindingNode } from "@relkit/graph";
import {
  resolveProviderConnection,
  type BindingValueRef,
  type BindingValueType,
  type ProviderConnectionValues,
} from "@relkit/provider";
import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import { engineTry, runEngineSync } from "./engine-runtime.js";
import type {
  ProviderBindingValueSources,
  ResolvedProviderBindingConfiguration,
  ScopedValues,
} from "./provider-binding-resolution.types.js";
export type {
  ProviderBindingValueSources,
  ResolvedProviderBindingConfiguration,
} from "./provider-binding-resolution.types.js";

/** Resolve and freeze explicit provider connection values synchronously.
 * @returns Frozen behavior and resolved explicit connection values.
 * @param binding - Verified provider or native task binding.
 * @param sources - Explicit connection values grouped by authority.
 */
export function resolveProviderBindingConfiguration(
  binding: ProviderBindingNode,
  sources: ProviderBindingValueSources = {},
): ResolvedProviderBindingConfiguration {
  return runEngineSync(resolveProviderBindingConfigurationEffect(binding, sources));
}

/** Resolve and freeze explicit provider connection values synchronously.
 * @param binding - Provider binding with declared connection fields.
 * @param sources - Explicit deployment/local/named values; application environment is not a fallback.
 * @returns A lazy Effect yielding frozen provider configuration or the native connection validation error.
 */
export const resolveProviderBindingConfigurationEffect = Effect.fn(
  "Engine.resolveProviderBindingConfiguration",
)((binding: ProviderBindingNode, sources: ProviderBindingValueSources = {}) =>
  observeExecution(
    "engine",
    "resolveProviderBindingConfiguration",
    engineTry((): ResolvedProviderBindingConfiguration => {
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
    }),
  ),
);

/** Select connection values belonging to one exact binding identity.
 * @typeParam Name - Selected connection-value source name.
 * @returns The selected binding's explicit values, or an empty object.
 * @param name - Declared operation, dependency or field name.
 * @param bindingId - Exact binding identifier whose values may be exposed.
 * @param source - Explicit native source or source collection.
 */
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

/** Clone validated JSON configuration and recursively freeze it.
 * @typeParam Value - Configuration value preserved by freezing.
 * @returns A JSON-safe, deeply frozen clone.
 * @param value - Native value being validated or projected.
 */
function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}
