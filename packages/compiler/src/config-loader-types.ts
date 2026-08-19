export const CONFIG_CODES = Object.freeze({
  root: "ZSYS_CONFIG_ROOT_INVALID",
  key: "ZSYS_CONFIG_KEY_NOT_ALLOWED",
  behavior: "ZSYS_CONFIG_APPLICATION_BEHAVIOR",
  path: "ZSYS_CONFIG_PATH_INVALID",
  outsideRoot: "ZSYS_CONFIG_PATH_OUTSIDE_ROOT",
  source: "ZSYS_CONFIG_SOURCE_INVALID",
  exclude: "ZSYS_CONFIG_EXCLUDE_INVALID",
  inspector: "ZSYS_CONFIG_INSPECTOR_INVALID",
  port: "ZSYS_CONFIG_PORT_INVALID",
} as const);

export type ConfigIssueCode = (typeof CONFIG_CODES)[keyof typeof CONFIG_CODES];

export interface ConfigIssue {
  readonly code: ConfigIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ToolingConfigInput {
  readonly entry?: string;
  readonly source?: readonly string[];
  readonly exclude?: readonly string[];
  readonly generatedDirectory?: string;
  readonly inspector?: { readonly port?: number };
}

export interface LoadedToolingConfig {
  readonly projectRoot: string;
  readonly entry: string;
  readonly source: readonly string[];
  readonly exclude: readonly string[];
  readonly generatedDirectory: string;
  readonly inspector: { readonly port: number };
}

export type InspectorConfigInput = ToolingConfigInput["inspector"];
export type InspectorConfig = NonNullable<LoadedToolingConfig["inspector"]>;
export type ZsysConfig = LoadedToolingConfig;
export type ConfigLoaderOptions = { readonly projectRoot?: string };

export const DEFAULT_TOOLING_CONFIG = Object.freeze({
  entry: "src/app.ts",
  source: Object.freeze(["src/**/*.ts"]),
  exclude: Object.freeze(["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/__fixtures__/**"]),
  generatedDirectory: ".zsys/generated",
  inspector: Object.freeze({ port: 3210 }),
});

export const DEFAULT_CONFIG = DEFAULT_TOOLING_CONFIG;
