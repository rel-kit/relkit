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

export interface DeploymentConfig {
  readonly target: "aws";
  readonly adapter: "pulumi";
}

export interface ZsysConfig {
  readonly server?: ServerConfig;
  readonly inspector?: InspectorConfig;
  readonly deployment?: DeploymentConfig;
}

/**
 * Defines the convention-only settings read by the ZSYS compiler and CLI.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@zsys/app/config"
 *
 * export default defineConfig({
 *   server: { port: 3000 },
 *   inspector: { port: 3210 },
 *   deployment: { target: "aws", adapter: "pulumi" },
 * })
 * ```
 * @category Configuration
 * @since 0.1.0
 */
export function defineConfig(config: ZsysConfig): Readonly<ZsysConfig> {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("ZSYS config must be an object");
  }
  if (
    config.deployment !== undefined &&
    (config.deployment.target !== "aws" || config.deployment.adapter !== "pulumi")
  ) {
    throw new TypeError("ZSYS deployment must select the aws target and pulumi adapter");
  }
  return deepFreeze(config) as Readonly<ZsysConfig>;
}
