import type { EnvDefinition, EnvShape } from "@relkit/config";
import type { DescriptorBase, DescriptorMetadata, JsonValue } from "@relkit/contracts";
import type { TelemetryConfiguration, TelemetryExporterMap } from "@relkit/observability/telemetry";
import type {
  NormalizedProviderProfiles,
  ProviderAdapter,
  ProviderCapability,
  ProviderInput,
  ProviderSourceInput,
} from "@relkit/provider";

export interface ApiDocsConfig {
  readonly enabledInProduction?: boolean;
  readonly excludeDomains?: readonly string[];
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

export const APP_PROVIDER_CAPABILITIES = ["bucket", "cache", "job", "event", "model"] as const;

export type AppProviderCapability = (typeof APP_PROVIDER_CAPABILITIES)[number];

type CapabilityInput<Capability extends AppProviderCapability> = ProviderInput<
  ProviderSourceInput<ProviderAdapter<ProviderCapability<Capability>>>
>;

export interface AppProviderInputs {
  readonly bucket?: CapabilityInput<"bucket">;
  readonly cache?: CapabilityInput<"cache">;
  readonly job?: CapabilityInput<"job">;
  readonly event?: CapabilityInput<"event">;
  readonly model?: CapabilityInput<"model">;
}

type Profile<Input> = Input extends ProviderSourceInput ? "default" : Extract<keyof Input, string>;

export type AppProviderDefaults<Providers extends AppProviderInputs> = Readonly<{
  [Capability in AppProviderCapability]?: Capability extends keyof Providers
    ? Profile<NonNullable<Providers[Capability]>>
    : never;
}>;

export type AppTelemetryConfig<Exporters extends TelemetryExporterMap = TelemetryExporterMap> =
  TelemetryConfiguration<Exporters>;
export type AppDeploymentConfig = Readonly<Record<string, JsonValue>>;

export type DefineAppOptions<
  Shape extends EnvShape,
  Providers extends AppProviderInputs,
  Exporters extends TelemetryExporterMap = TelemetryExporterMap,
> = DescriptorMetadata &
  Providers & {
    readonly id?: string;
    readonly env: EnvDefinition<Shape>;
    readonly defaults?: AppProviderDefaults<Providers>;
    readonly telemetry?: AppTelemetryConfig<Exporters>;
    readonly server?: ServerConfig;
    readonly inspector?: InspectorConfig;
    readonly deployment?: AppDeploymentConfig;
  };

type AdapterOf<Input> =
  Input extends ProviderSourceInput<infer Adapter>
    ? Adapter
    : Input extends Readonly<Record<string, infer Binding>>
      ? Binding extends ProviderSourceInput<infer Adapter>
        ? Adapter
        : never
      : never;

type NormalizedProviders<Providers extends AppProviderInputs> = {
  readonly [Capability in keyof Providers & AppProviderCapability]: NormalizedProviderProfiles<
    AdapterOf<NonNullable<Providers[Capability]>>
  >;
};

export type ApplicationDescriptor<
  Shape extends EnvShape = EnvShape,
  Providers extends AppProviderInputs = AppProviderInputs,
  Exporters extends TelemetryExporterMap = TelemetryExporterMap,
> = DescriptorBase<"app", string> &
  NormalizedProviders<Providers> & {
    readonly env: EnvDefinition<Shape>;
    readonly defaults: AppProviderDefaults<Providers>;
    readonly telemetry?: AppTelemetryConfig<Exporters>;
    readonly server?: ServerConfig;
    readonly inspector?: InspectorConfig;
    readonly deployment?: AppDeploymentConfig;
  };
