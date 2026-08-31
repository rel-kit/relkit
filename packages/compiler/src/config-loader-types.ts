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

export type ConfigIssueCode = (typeof CONFIG_CODES)[keyof typeof CONFIG_CODES];

export interface ConfigIssue {
  readonly code: ConfigIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ToolingConfigInput {
  readonly server?: {
    readonly port?: number;
    readonly maxBodyBytes?: number;
    readonly apiDocs?: {
      readonly enabledInProduction?: boolean;
      readonly excludeDomains?: readonly string[];
    };
    readonly clientContract?: boolean;
    readonly mcp?: boolean;
  };
  readonly inspector?: {
    readonly port?: number;
    readonly enabledInProduction?: boolean;
    readonly maxPreviewBytes?: number;
  };
  readonly deployment?: {
    readonly target: "aws";
    readonly adapter: "pulumi";
  };
}

export interface LoadedToolingConfig {
  readonly projectRoot: string;
  readonly source: readonly string[];
  readonly exclude: readonly string[];
  readonly generatedDirectory: string;
  readonly server: {
    readonly port: number;
    readonly maxBodyBytes: number;
    readonly apiDocs: {
      readonly enabledInProduction: boolean;
      readonly excludeDomains?: readonly string[];
    };
    readonly clientContract: boolean;
    readonly mcp: boolean;
  };
  readonly inspector: {
    readonly port: number;
    readonly enabledInProduction: boolean;
    readonly maxPreviewBytes: number;
  };
  readonly deployment?: {
    readonly target: "aws";
    readonly adapter: "pulumi";
  };
}

export type InspectorConfigInput = ToolingConfigInput["inspector"];
export type InspectorConfig = NonNullable<LoadedToolingConfig["inspector"]>;
export type RelkitConfig = LoadedToolingConfig;
export type ConfigLoaderOptions = { readonly projectRoot?: string };

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
