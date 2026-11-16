import type { EnvDefinition, EnvShape } from "../config/index.js";
import type { DescriptorBase, DescriptorMetadata, JsonValue } from "../contracts/index.js";
import type { TelemetryConfiguration, TelemetryExporterMap } from "../observability/telemetry.js";
import type { InspectorConfig, ServerConfig } from "./app-config.types.js";
import type {
  AppProviderBindings,
  AppProviderDefaults,
  AppProviderOptions,
  NormalizedAppProviderDefaults,
  NormalizedProviders,
} from "./app-provider.types.js";

export type { ApiDocsConfig, ServerConfig, InspectorConfig } from "./app-config.types.js";
export type {
  ApplicationProfilesOf,
  AppProviderBindings,
  AppProviderCapability,
  AppProviderInputs,
  AppProviderDefaults,
  AppProviderOptions,
  NoProviderConfigured,
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

/** Opt-in `relkit check` rules.
 * @example const check: AppCheckConfig = { unusedErrors: true };
 */
export interface AppCheckConfig {
  /** Warn when a function declares an error that its handler never raises. Defaults to `false`. */
  readonly unusedErrors?: boolean;
}

/** Authored application topology and runtime settings.
 * @example const options: DefineAppOptions<{}, {}> = { env: defineEnv({}) };
 */
export type DefineAppOptions<
  Shape extends EnvShape,
  Providers extends AppProviderBindings,
  Exporters extends TelemetryExporterMap = TelemetryExporterMap,
> = DescriptorMetadata &
  AppProviderOptions<Providers> & {
    /** Stable name of the application in graphs, telemetry and deployment. */
    readonly id?: string;
    /** The environment contract from `defineEnv`; handlers read it as `context.env`. */
    readonly env: EnvDefinition<Shape>;
    /** The profile a descriptor uses when it names none, per capability. */
    readonly defaults?: AppProviderDefaults<Providers>;
    /** Redaction, local retention, sampling and exporters of telemetry. */
    readonly telemetry?: AppTelemetryConfig<Exporters>;
    /** The HTTP server: port, body limit, API reference, MCP and startup hook. */
    readonly server?: ServerConfig;
    /** The development Inspector's bridge; off unless `enabled` is `true`. */
    readonly inspector?: InspectorConfig;
    /** JSON metadata for the deployment engine, such as `{ engine: "pulumi" }`. */
    readonly deployment?: AppDeploymentConfig;
    /** Opt-in rules of `relkit check`. */
    readonly check?: AppCheckConfig;
  };

/** The bindings of one `defineApp` call, from its one type parameter per capability.
 * @example type Bindings = DefineAppBindings<typeof s3Adapter>;
 */
export interface DefineAppBindings<
  Bucket = undefined,
  Cache = undefined,
  Jobs = undefined,
  Event = undefined,
  Model = undefined,
  Realtime = undefined,
  AgentState = undefined,
> {
  readonly bucket: Bucket;
  readonly cache: Cache;
  readonly jobs: Jobs;
  readonly event: Event;
  readonly model: Model;
  readonly realtime: Realtime;
  readonly "agent-state": AgentState;
}

/** Immutable normalized application descriptor returned by `defineApp`.
 * @example const descriptor: ApplicationDescriptor = defineApp({ env: defineEnv({}) });
 */
export type ApplicationDescriptor<
  Shape extends EnvShape = EnvShape,
  Providers extends AppProviderBindings = AppProviderBindings,
  Exporters extends TelemetryExporterMap = TelemetryExporterMap,
> = DescriptorBase<"app", string> &
  NormalizedProviders<Providers> & {
    readonly env: EnvDefinition<Shape>;
    readonly defaults: NormalizedAppProviderDefaults<Providers>;
    readonly telemetry?: AppTelemetryConfig<Exporters>;
    readonly server?: ServerConfig;
    readonly inspector?: InspectorConfig;
    readonly deployment?: AppDeploymentConfig;
    readonly check?: AppCheckConfig;
  };
