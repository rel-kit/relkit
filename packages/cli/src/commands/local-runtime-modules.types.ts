import type {
  LocalServiceMaterializerRuntime,
  LocalServicePlan,
  LocalServiceRecipeInput,
  LocalServiceInstance,
  LocalServiceState,
  LocalServiceWorkerArtifact,
} from "@relkit/local-service";

/** Owner-validated identity used for leases, state files and container labels. */
export interface LoadedLocalIdentity {
  readonly applicationId: string;
  readonly projectRoot: string;
  readonly localProjectId: string;
}

/** Existing project lease whose native owner decides adoption and recovery. */
export interface LoadedLocalLease {
  readonly mode: "attached" | "detached";
  readonly sessionId: string;
  readonly ownerPid?: number;
}

/** Narrow reconciler handle validated from the owning runtime package. */
export interface LoadedLocalReconciler {
  /**
   * Reconciles one accepted compiler cohort against local native resources.
   * @param request - Matching plan hash, recipes, worker artifacts and cancellation.
   * @returns Committed provider generation and local state after physical settlement.
   */
  readonly reconcile: (request: {
    readonly plan: LocalServicePlan;
    readonly planHash: string;
    readonly recipes: Readonly<Record<string, LocalServiceRecipeInput>>;
    readonly scope: "required" | "all";
    readonly environment?: string;
    readonly serviceGeneration?: string;
    readonly serviceGenerations?: Readonly<Record<string, string>>;
    readonly endpoints?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly environmentOverrides?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly environmentOverridesByUnit?: Readonly<
      Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
    >;
    readonly workerArtifacts?: Readonly<Record<string, LocalServiceWorkerArtifact>>;
    readonly signal?: AbortSignal;
  }) => Promise<{
    readonly overrides: { readonly generationId: string };
    readonly state: LocalServiceState;
  }>;
  /**
   * Releases the reconciler's native resource owner once.
   * @returns Joined native cleanup before project lease release.
   */
  readonly close: () => Promise<void>;
}

/** Validated callable exports from the local runtime integration owner. */
export interface LoadedLocalRuntime {
  /**
   * Normalizes a project's stable local identity.
   * @param root - Authored project root.
   * @param applicationId - Accepted application graph identifier.
   * @returns Owner-normalized identity used for native resource ownership.
   */
  readonly createLocalProjectIdentity: (root: string, applicationId: string) => LoadedLocalIdentity;
  /**
   * Produces container ownership labels for this project.
   * @param identity - Normalized local project identity.
   * @returns Immutable labels accepted by the materializer.
   */
  readonly localProjectLabels: (identity: LoadedLocalIdentity) => Readonly<Record<string, string>>;
  /**
   * Acquires or adopts the project lease before materializer mutations.
   * @param identity - Project whose local resources will be owned.
   * @param options - Attached/detached mode and unique session identity.
   * @returns Lease state and exactly owned synchronous release.
   */
  readonly acquireLocalProjectLease: (
    identity: LoadedLocalIdentity,
    options: {
      readonly mode: "attached" | "detached";
      readonly sessionId: string;
    },
  ) => {
    readonly lease: LoadedLocalLease;
    readonly status: "acquired" | "adopted" | "recovered";
    /**
     * Releases only this acquired lease.
     * @returns No value after native lease release.
     */
    readonly release: () => void;
  };
  /**
   * Reads existing ownership without mutating local resources.
   * @param identity - Selected local project.
   * @returns Current lease or absence.
   */
  readonly readLocalProjectLease: (identity: LoadedLocalIdentity) => LoadedLocalLease | undefined;
  /**
   * Constructs the native reconciler after lease authority is acquired.
   * @param options - Selected identity, materializer and detach preservation policy.
   * @returns Owned callable reconciler handle.
   */
  readonly createLocalServiceReconciler: (options: {
    readonly identity: LoadedLocalIdentity;
    readonly materializer: LocalServiceMaterializerRuntime;
    readonly preserveOnClose: boolean;
  }) => LoadedLocalReconciler;
  /**
   * Reads the current committed local service state.
   * @param identity - Selected project identity.
   * @returns Persisted state or absence without resource mutation.
   */
  readonly readLocalServiceState: (identity: LoadedLocalIdentity) => LocalServiceState | undefined;
  /**
   * Selects the native state directory belonging to this identity.
   * @param identity - Normalized local project.
   * @returns The owner-selected directory path.
   */
  readonly localStateDirectory: (identity: LoadedLocalIdentity) => string;
  /**
   * Removes one declared state file after explicit stop/reset ownership.
   * @param identity - Project whose state is being released.
   * @param name - Finite allowed state-file name.
   * @returns No value after the native removal settles.
   */
  readonly removeLocalStateFile: (
    identity: LoadedLocalIdentity,
    name:
      | "lease.json"
      | "local-services.state.json"
      | "provider-overrides.json"
      | "worker-provider-overrides.json"
      | "local-secrets.json",
  ) => void;
  /**
   * Coalesces aliases sharing one native materialized instance.
   * @param instances - Committed local service instances.
   * @returns Distinct instances in the runtime owner's grouping order.
   */
  readonly groupServiceInstances: (
    instances: readonly LocalServiceInstance[],
  ) => readonly LocalServiceInstance[];
  /**
   * Reads every authored service identifier represented by one grouped instance.
   * @param instance - Native instance with possible service aliases.
   * @returns Stable service identifiers used for endpoint/label selection.
   */
  readonly serviceInstanceIds: (instance: LocalServiceInstance) => readonly string[];
}

/** Native handles resolved from contained, schema-validated integration exports. */
export interface LoadedLocalRuntimeModules {
  readonly local: LoadedLocalRuntime;
  readonly materializer: LocalServiceMaterializerRuntime;
}
