/** Project manifest sections owned by scaffold dependency and script planning. */
import type { Schema } from "effect";

export interface ScaffoldManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  overrides?: Schema.Json;
  pnpm?: Schema.Json;
  readonly [key: string]: unknown;
}

/** Deterministic manifest bytes and newly introduced dependency identities. */
export interface ScaffoldManifestMerge {
  readonly content: string;
  readonly added: Record<string, string>;
}
