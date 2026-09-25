import type { JsonValue } from "@relkit/contracts";
import type { ProviderConnectionField, ProviderConnectionValues } from "./protocol.types.js";

/** Inputs for resolving authored, local, infrastructure, and named values. */
export interface ResolveProviderConnectionOptions {
  readonly profile: string;
  readonly bindingId?: string;
  readonly local?: Readonly<Record<string, JsonValue>>;
  readonly infrastructure?: Readonly<Record<string, JsonValue>>;
  readonly values?: Readonly<Record<string, JsonValue>>;
}

/** Minimal adapter shape accepted by connection resolution. */
export interface ProviderConnectionDescriptor {
  readonly capability: Readonly<{ readonly id: string }>;
  readonly connectionContract: Readonly<{
    readonly fields: Readonly<Record<string, ProviderConnectionField>>;
  }>;
  readonly connection: ProviderConnectionValues;
}
