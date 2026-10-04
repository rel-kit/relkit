import type { ProviderCapability } from "@relkit/engine";

/** Explicit capability/profile replacements; absent profiles remain native authority decisions. */
export type TestProviderReplacements = Readonly<
  Partial<Record<ProviderCapability, Readonly<Record<string, unknown>>>>
>;
