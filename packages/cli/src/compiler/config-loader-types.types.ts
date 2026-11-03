import type { Schema } from "effect";
import type {
  ConfigIssueSchema,
  LoadedToolingConfigSchema,
  ToolingConfigInputSchema,
} from "./config-loader-types.js";

import type { CONFIG_CODES } from "./config-loader-types.js";

/** Stable tooling configuration validation codes. */
export type ConfigIssueCode = (typeof CONFIG_CODES)[keyof typeof CONFIG_CODES];

/** Schema-derived ordered configuration rejection evidence. */
export interface ConfigIssue extends Schema.Schema.Type<typeof ConfigIssueSchema> {}

/** Schema-derived optional tooling input before defaults are applied. */
export interface ToolingConfigInput extends Schema.Schema.Type<typeof ToolingConfigInputSchema> {}

/** Schema-derived immutable tooling settings after validation and defaults. */
export interface LoadedToolingConfig extends Schema.Schema.Type<typeof LoadedToolingConfigSchema> {}

/** Optional inspector settings accepted by tooling configuration. */
export type InspectorConfigInput = ToolingConfigInput["inspector"];

/** Fully defaulted inspector settings used by runtime consumers. */
export type InspectorConfig = NonNullable<LoadedToolingConfig["inspector"]>;

/** Compatibility alias for fully validated tooling configuration. */
export type RelkitConfig = LoadedToolingConfig;

/** Optional absolute root used when validating tooling settings. */
export type ConfigLoaderOptions = { readonly projectRoot?: string };
