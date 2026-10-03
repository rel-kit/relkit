import type { JsonValue } from "@relkit/contracts";

/** Explicit connection values partitioned by binding identity. */
export type ScopedValues = Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;

/** Named, local and infrastructure values; application environment is not a fallback. */
export interface ProviderBindingValueSources {
  readonly values?: Readonly<Record<string, JsonValue>>;
  readonly local?: ScopedValues;
  readonly infrastructure?: ScopedValues;
}

/** Frozen provider behavior and validated resolved connection values. */
export interface ResolvedProviderBindingConfiguration {
  readonly behavior: JsonValue;
  readonly connection: Readonly<Record<string, JsonValue>>;
}
