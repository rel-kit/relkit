import type { LOCAL_SERVICE_PROTOCOL_VERSION } from "./protocol.js";
import type {
  LocalServiceBindMount,
  LocalServiceRecipeInput,
  LocalServiceWorkerArtifact,
} from "./recipe.types.js";

/** Observed materializer instance, possibly containing child units.
 * @example const healthy = instance.health === "healthy";
 */
export interface LocalServiceInstance {
  readonly id: string;
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly state: string;
  readonly health?: "starting" | "healthy" | "unhealthy";
  readonly ports: Readonly<Record<string, number>>;
  readonly unitId?: string;
  readonly units?: readonly LocalServiceInstance[];
  readonly networkName?: string;
  readonly environment?: string;
  readonly serviceGeneration?: string;
}

/** Parameters for starting one materialized local service.
 * The caller owns cancellation through `signal` and materializer cleanup after start.
 * @example await materializer.start(request);
 */
export interface LocalServiceStartRequest {
  readonly name: string;
  readonly volumeName?: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly recipe: LocalServiceRecipeInput;
  readonly environmentFile?: string;
  readonly environmentFiles?: Readonly<Record<string, string>>;
  readonly environmentVariables?: Readonly<Record<string, string>>;
  readonly volumeNames?: Readonly<Record<string, string>>;
  readonly networkName?: string;
  readonly serviceGeneration?: string;
  readonly workerArtifact?: LocalServiceWorkerArtifact;
  readonly bindMounts?: Readonly<Record<string, readonly LocalServiceBindMount[]>>;
  readonly environmentVariablesByUnit?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly portBindings?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly signal?: AbortSignal;
}

/** External materializer operations that own local containers and volumes.
 * Implementations must release their acquired resources through stop, remove, and removeVolumes.
 * @example const services = await materializer.list({ application: "demo" });
 */
export interface LocalServiceMaterializerRuntime {
  readonly kind: "local-service-materializer-runtime";
  readonly protocolVersion: typeof LOCAL_SERVICE_PROTOCOL_VERSION;
  readonly integrationId: string;
  /** List matching services.
   * @param labels - Bounded identity labels used for lookup.
   * @param signal - Optional cancellation signal.
   * @returns Matching instances or a rejected provider promise.
   * @example await materializer.list({ application: "demo" });
   */
  readonly list: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<readonly LocalServiceInstance[]>;
  /** Start one requested service and return its live instance.
   * @param request - Recipe and runtime bindings.
   * @returns A live instance or a rejected provider promise.
   * @example await materializer.start(request);
   */
  readonly start: (request: LocalServiceStartRequest) => Promise<LocalServiceInstance>;
  /** Stop a live service without deleting it.
   * @param id - Materializer instance ID.
   * @param signal - Optional cancellation signal.
   * @returns Completion or a rejected provider promise.
   * @example await materializer.stop?.(instance.id);
   */
  readonly stop?: (id: string, signal?: AbortSignal) => Promise<void>;
  /** Remove a stopped service.
   * @param id - Materializer instance ID.
   * @param signal - Optional cancellation signal.
   * @returns Completion or a rejected provider promise.
   * @example await materializer.remove(instance.id);
   */
  readonly remove: (id: string, signal?: AbortSignal) => Promise<void>;
  /** Remove volumes owned by matching services.
   * @param labels - Ownership labels.
   * @param signal - Optional cancellation signal.
   * @returns Completion or a rejected provider promise.
   * @example await materializer.removeVolumes({ application: "demo" });
   */
  readonly removeVolumes: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<void>;
  /** List matching volumes when the materializer supports it.
   * @param labels - Ownership labels.
   * @param signal - Optional cancellation signal.
   * @returns Named volumes or a rejected provider promise.
   * @example await materializer.listVolumes?.({ application: "demo" });
   */
  readonly listVolumes?: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<
    readonly { readonly name: string; readonly labels: Readonly<Record<string, string>> }[]
  >;
  /** Remove networks owned by matching services.
   * @param labels - Ownership labels.
   * @param signal - Optional cancellation signal.
   * @returns Completion or a rejected provider promise.
   * @example await materializer.removeNetworks?.({ application: "demo" });
   */
  readonly removeNetworks?: (
    labels: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ) => Promise<void>;
}
