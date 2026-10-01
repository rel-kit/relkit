export type {
  ConfigIssueCode,
  ConfigIssue,
  ToolingConfigInput,
  LoadedToolingConfig,
  InspectorConfigInput,
  InspectorConfig,
  RelkitConfig,
  ConfigLoaderOptions,
} from "./config-loader-types.types.js";
import { Schema } from "effect";

/** Validated TCP port shared by field-level readers and normalized records. */
export const ConfigPort = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 65_535 }),
);

/** Positive integer byte limit shared by tooling field readers. */
export const ConfigPositive = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
export const CONFIG_CODES = Object.freeze({
  root: "RELKIT_CONFIG_ROOT_INVALID",
  key: "RELKIT_CONFIG_KEY_NOT_ALLOWED",
  behavior: "RELKIT_CONFIG_APPLICATION_BEHAVIOR",
  path: "RELKIT_CONFIG_PATH_INVALID",
  outsideRoot: "RELKIT_CONFIG_PATH_OUTSIDE_ROOT",
  source: "RELKIT_CONFIG_SOURCE_INVALID",
  exclude: "RELKIT_CONFIG_EXCLUDE_INVALID",
  inspector: "RELKIT_CONFIG_INSPECTOR_INVALID",
  port: "RELKIT_CONFIG_PORT_INVALID",
  legacy: "RELKIT_CONFIG_LEGACY_KEY",
} as const);

/** Accepted tooling input, before defaults and cross-field checks are applied. */
export const ToolingConfigInputSchema = Schema.Struct({
  server: Schema.optionalKey(
    Schema.Struct({
      port: Schema.optionalKey(Schema.Number),
      maxBodyBytes: Schema.optionalKey(Schema.Number),
      apiDocs: Schema.optionalKey(
        Schema.Struct({
          enabledInProduction: Schema.optionalKey(Schema.Boolean),
          excludeDomains: Schema.optionalKey(Schema.Array(Schema.String)),
        }),
      ),
      clientContract: Schema.optionalKey(Schema.Boolean),
      mcp: Schema.optionalKey(Schema.Boolean),
    }),
  ),
  inspector: Schema.optionalKey(
    Schema.Struct({
      port: Schema.optionalKey(Schema.Number),
      enabledInProduction: Schema.optionalKey(Schema.Boolean),
      maxPreviewBytes: Schema.optionalKey(Schema.Number),
    }),
  ),
  deployment: Schema.optionalKey(Schema.Struct({ engine: Schema.String, host: Schema.String })),
});

/** Fully defaulted data-only tooling configuration produced by the parser. */
export const LoadedToolingConfigSchema = Schema.Struct({
  projectRoot: Schema.String,
  source: Schema.Array(Schema.String),
  exclude: Schema.Array(Schema.String),
  generatedDirectory: Schema.String,
  server: Schema.Struct({
    port: ConfigPort,
    maxBodyBytes: ConfigPositive,
    apiDocs: Schema.Struct({
      enabledInProduction: Schema.Boolean,
      excludeDomains: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
    clientContract: Schema.Boolean,
    mcp: Schema.Boolean,
  }),
  inspector: Schema.Struct({
    port: ConfigPort,
    enabledInProduction: Schema.Boolean,
    maxPreviewBytes: ConfigPositive,
  }),
  deployment: Schema.optionalKey(Schema.Struct({ engine: Schema.String, host: Schema.String })),
});

/** Configuration issue evidence kept in declaration order. */
export const ConfigIssueSchema = Schema.Struct({
  code: Schema.Literals(Object.values(CONFIG_CODES)),
  path: Schema.String,
  message: Schema.String,
});

export const DEFAULT_TOOLING_CONFIG = Object.freeze({
  source: Object.freeze(["src/**/*.ts"]),
  exclude: Object.freeze([
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.d.ts",
    "src/**/__tests__/**",
    "src/**/__fixtures__/**",
  ]),
  generatedDirectory: ".relkit/generated",
  server: Object.freeze({
    port: 3000,
    maxBodyBytes: 1_048_576,
    apiDocs: Object.freeze({ enabledInProduction: false }),
    clientContract: true,
    mcp: true,
  }),
  inspector: Object.freeze({
    port: 3210,
    enabledInProduction: false,
    maxPreviewBytes: 1_048_576,
  }),
});

export const DEFAULT_CONFIG = DEFAULT_TOOLING_CONFIG;
