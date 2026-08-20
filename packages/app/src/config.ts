import { deepFreeze } from "@zsys/contracts";

export interface ApiDocsConfig {
  readonly enabledInProduction?: boolean;
}

export interface ServerConfig {
  readonly port?: number;
  readonly maxBodyBytes?: number;
  readonly apiDocs?: ApiDocsConfig;
}

export interface InspectorConfig {
  readonly port?: number;
}

export interface ZsysConfig {
  readonly server?: ServerConfig;
  readonly inspector?: InspectorConfig;
}

/**
 * Defines the convention-only settings read by the ZSYS compiler and CLI.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@zsys/app/config"
 *
 * export default defineConfig({ server: { port: 3000 }, inspector: { port: 3210 } })
 * ```
 * @category Configuration
 * @since 0.1.0
 */
export function defineConfig(config: ZsysConfig): Readonly<ZsysConfig> {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("ZSYS config must be an object");
  }
  return deepFreeze(config) as Readonly<ZsysConfig>;
}
