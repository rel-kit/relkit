import type { EnvDefinition, EnvShape } from "@relkit/config";
import type { DescriptorBase, DescriptorMetadata, JsonValue } from "@relkit/contracts";
import type { TelemetryConfiguration, TelemetryExporterMap } from "@relkit/observability/telemetry";
import type { AppCompatibilityConfig, InspectorConfig, ServerConfig } from "./app-config.types.js";
import type {
  AppProviderDefaults,
  AppProviderInputs,
  NormalizedAppProviderDefaults,
  NormalizedProviders,
} from "./app-provider.types.js";

export type {
  ApiDocsConfig,
  ServerConfig,
  InspectorConfig,
  AppCompatibilityConfig,
} from "./app-config.types.js";
export type {
  AppProviderCapability,
  AppProviderInputs,
  AppProviderDefaults,
  NormalizedAppProviderDefaults,
} from "./app-provider.types.js";

/** Application telemetry settings parameterized by exporters.
 * @example const telemetry: AppTelemetryConfig = { redaction: { mode: "off" } };
 */
export type AppTelemetryConfig<Exporters extends TelemetryExporterMap = TelemetryExporterMap> =
  TelemetryConfiguration<Exporters>;

/** JSON deployment metadata attached to the application descriptor.
 * @example const deployment: AppDeploymentConfig = { engine: "pulumi" };
 */
export type AppDeploymentConfig = Readonly<Record<string, JsonValue>>;

/** Authored application topology and runtime settings.
 * @example const options: DefineAppOptions<{}, {}> = { env: defineEnv({}) };
 */
export type DefineAppOptions<
  Shape extends EnvShape,
  Providers extends AppProviderInputs,
  Exporters extends TelemetryExporterMap = TelemetryExporterMap,
> = DescriptorMetadata &
  Providers & {
    readonly id?: string;
    readonly env: EnvDefinition<Shape>;
    readonly defaults?: AppProviderDefaults<Providers>;
    readonly compatibility?: AppCompatibilityConfig;
    readonly telemetry?: AppTelemetryConfig<Exporters>;
    readonly server?: ServerConfig;
    readonly inspector?: InspectorConfig;
    readonly deployment?: AppDeploymentConfig;
  };

/** Immutable normalized application descriptor returned by `defineApp`.
 * @example const descriptor: ApplicationDescriptor = defineApp({ env: defineEnv({}) });
 */
export type ApplicationDescriptor<
  Shape extends EnvShape = EnvShape,
  Providers extends AppProviderInputs = AppProviderInputs,
  Exporters extends TelemetryExporterMap = TelemetryExporterMap,
> = DescriptorBase<"app", string> &
  NormalizedProviders<Providers> & {
    readonly env: EnvDefinition<Shape>;
    readonly defaults: NormalizedAppProviderDefaults<Providers>;
    readonly compatibility: { readonly legacyJobs: boolean };
    readonly telemetry?: AppTelemetryConfig<Exporters>;
    readonly server?: ServerConfig;
    readonly inspector?: InspectorConfig;
    readonly deployment?: AppDeploymentConfig;
  };
