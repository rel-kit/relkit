import type { EnvDefinition, EnvRef, EnvShape } from "@relkit/config";
import type { DescriptorBase, DescriptorMetadata, JsonValue } from "@relkit/contracts";
import type { CapabilityBindings } from "./providers.js";

export interface ApiDocsConfig {
  readonly enabledInProduction?: boolean;
}

export interface ServerConfig {
  readonly port?: number;
  readonly maxBodyBytes?: number;
  readonly apiDocs?: ApiDocsConfig;
  readonly clientContract?: boolean;
  readonly mcp?: boolean;
}

export interface InspectorConfig {
  readonly port?: number;
  readonly enabledInProduction?: boolean;
  readonly maxPreviewBytes?: number;
}

export interface DeploymentConfig {
  readonly target: "aws";
  readonly adapter: "pulumi";
}

export interface SentryConfig {
  readonly dsn: string | EnvRef;
  readonly tracesSampleRate?: number;
  readonly sendDefaultPii?: false;
}

export interface ConfigProviderMaps {
  readonly buckets?: CapabilityBindings<"buckets">;
  readonly caches?: CapabilityBindings<"cache">;
  readonly jobs?: CapabilityBindings<"jobs">;
  readonly events?: CapabilityBindings<"events">;
  readonly models?: CapabilityBindings<"models">;
  readonly observability?: CapabilityBindings<"observability">;
}

type Profile<Map> = Extract<keyof NonNullable<Map>, string>;

export type CapabilityDefaults<Maps extends ConfigProviderMaps> = Readonly<{
  bucket?: Profile<Maps["buckets"]>;
  cache?: Profile<Maps["caches"]>;
  job?: Profile<Maps["jobs"]>;
  event?: Profile<Maps["events"]>;
  model?: Profile<Maps["models"]>;
  observability?: Profile<Maps["observability"]>;
}>;

export type TelemetryConfig = Readonly<Record<string, JsonValue | EnvRef>>;

export type DefineConfigOptions<
  S extends EnvShape,
  Maps extends ConfigProviderMaps,
> = DescriptorMetadata &
  Maps & {
    readonly id?: string;
    readonly env: EnvDefinition<S>;
    readonly defaults?: CapabilityDefaults<Maps>;
    readonly sentry?: SentryConfig;
    readonly telemetry?: TelemetryConfig;
    readonly server?: ServerConfig;
    readonly inspector?: InspectorConfig;
    readonly deployment?: DeploymentConfig;
  };

export type ApplicationConfigDescriptor<
  Id extends string = string,
  S extends EnvShape = EnvShape,
  Maps extends ConfigProviderMaps = ConfigProviderMaps,
> = DescriptorBase<"app", Id> & Omit<DefineConfigOptions<S, Maps>, keyof DescriptorMetadata | "id">;
