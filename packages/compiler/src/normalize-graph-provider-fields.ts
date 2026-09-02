import type {
  ProviderAdapterProjection,
  ProviderConnectionFieldProjection,
  ProviderNamedValueProjection,
} from "@relkit/graph";
import { clean } from "./normalize-graph-utils.js";
import { isRecord } from "./normalize-utils.js";

export function projectConnectionContract(
  fields: Record<string, unknown>,
): Readonly<Record<string, ProviderConnectionFieldProjection>> {
  return Object.fromEntries(
    Object.entries(fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([name, value]) => {
        if (!isRecord(value)) return [];
        const sensitive = value.sensitive === true;
        return [
          [
            name,
            {
              required: value.required === true,
              sensitive,
              authoredValue: value.authoredValue === "fallback" ? "fallback" : "fixed",
              ...(sensitive || value.default === undefined
                ? {}
                : { default: clean(value.default) }),
            },
          ],
        ];
      }),
  );
}

export function projectConnection(
  adapter: unknown,
  projection: Omit<ProviderAdapterProjection, "connection">,
): ProviderAdapterProjection["connection"] {
  if (!isRecord(adapter) || !isRecord(adapter.connection)) return {};
  return Object.fromEntries(
    Object.entries(adapter.connection)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([field, value]) => {
        const metadata = projection.connectionContract[field];
        return metadata === undefined || metadata.sensitive || isBindingValueRef(value)
          ? []
          : [[field, clean(value)]];
      }),
  );
}

export function projectNamedValues(
  adapter: unknown,
  contract: Readonly<Record<string, ProviderConnectionFieldProjection>>,
): readonly ProviderNamedValueProjection[] {
  if (!isRecord(adapter) || !isRecord(adapter.connection)) return [];
  return Object.entries(adapter.connection)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([field, value]) => {
      if (!isBindingValueRef(value) || contract[field] === undefined) return [];
      return [{ field, name: value.name, type: value.type, sensitive: value.sensitive === true }];
    });
}

function isBindingValueRef(value: unknown): value is {
  readonly name: string;
  readonly type: string;
  readonly sensitive: boolean;
} {
  return (
    isRecord(value) &&
    value.kind === "binding-value-ref" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.sensitive === "boolean"
  );
}
