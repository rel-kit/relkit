import { pathToFileURL } from "node:url";
import { resolveIntegrationPackageRole } from "@relkit/compiler";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import type {
  LocalServiceMaterializerRuntime,
  LocalServicePlan,
  LocalServiceRecipe,
  LocalServiceState,
} from "@relkit/local-service";

export interface LoadedLocalIdentity {
  readonly applicationId: string;
  readonly projectRoot: string;
  readonly localProjectId: string;
}

export interface LoadedLocalLease {
  readonly mode: "attached" | "detached";
  readonly sessionId: string;
  readonly ownerPid?: number;
}

export interface LoadedLocalReconciler {
  readonly reconcile: (request: {
    readonly plan: LocalServicePlan;
    readonly planHash: string;
    readonly recipes: Readonly<Record<string, LocalServiceRecipe>>;
    readonly scope: "required" | "all";
    readonly signal?: AbortSignal;
  }) => Promise<{
    readonly overrides: { readonly generationId: string };
    readonly state: LocalServiceState;
  }>;
  readonly close: () => Promise<void>;
}

export interface LoadedLocalRuntime {
  readonly createLocalProjectIdentity: (root: string, applicationId: string) => LoadedLocalIdentity;
  readonly localProjectLabels: (identity: LoadedLocalIdentity) => Readonly<Record<string, string>>;
  readonly acquireLocalProjectLease: (
    identity: LoadedLocalIdentity,
    options: {
      readonly mode: "attached" | "detached";
      readonly sessionId: string;
    },
  ) => {
    readonly lease: LoadedLocalLease;
    readonly status: "acquired" | "adopted" | "recovered";
    readonly release: () => void;
  };
  readonly readLocalProjectLease: (identity: LoadedLocalIdentity) => LoadedLocalLease | undefined;
  readonly createLocalServiceReconciler: (options: {
    readonly identity: LoadedLocalIdentity;
    readonly materializer: LocalServiceMaterializerRuntime;
    readonly preserveOnClose: boolean;
  }) => LoadedLocalReconciler;
  readonly readLocalServiceState: (identity: LoadedLocalIdentity) => LocalServiceState | undefined;
  readonly localStateDirectory: (identity: LoadedLocalIdentity) => string;
  readonly removeLocalStateFile: (
    identity: LoadedLocalIdentity,
    name: "lease.json" | "local-services.state.json" | "provider-overrides.json",
  ) => void;
}

export async function loadLocalRuntimeModules(
  projectRoot: string,
  materializerId: string,
): Promise<{
  readonly local: LoadedLocalRuntime;
  readonly materializer: LocalServiceMaterializerRuntime;
}> {
  if (materializerId !== "docker")
    throw new Error(`Unsupported local materializer: ${materializerId}`);
  const [localRole, materializerRole] = await Promise.all([
    resolveIntegrationPackageRole({
      projectRoot,
      packageName: "@relkit/local",
      integrationId: "local",
      role: "localService",
    }),
    resolveIntegrationPackageRole({
      projectRoot,
      packageName: "@relkit/docker",
      integrationId: "docker",
      role: "localMaterializer",
    }),
  ]);
  const [localModule, materializerModule] = await Promise.all([
    import(pathToFileURL(localRole.resolvedPath).href),
    import(pathToFileURL(materializerRole.resolvedPath).href),
  ]);
  assertFunctions(localModule, [
    "createLocalProjectIdentity",
    "localProjectLabels",
    "acquireLocalProjectLease",
    "readLocalProjectLease",
    "createLocalServiceReconciler",
    "readLocalServiceState",
    "localStateDirectory",
    "removeLocalStateFile",
  ]);
  assertFunctions(materializerModule, ["createDockerMaterializer"]);
  return Object.freeze({
    local: localModule as unknown as LoadedLocalRuntime,
    materializer: (
      materializerModule.createDockerMaterializer as () => LocalServiceMaterializerRuntime
    )(),
  });
}

export async function loadLocalRecipe(
  projectRoot: string,
  runtimePlan: RuntimeIntegrationPlan,
  integrationId: string,
): Promise<LocalServiceRecipe> {
  const selected = runtimePlan.integrations.find((entry) => entry.integrationId === integrationId);
  const packageName = selected?.packageName ?? `@relkit/${integrationId}`;
  const selectedRole = resolveIntegrationPackageRole({
    projectRoot,
    packageName,
    integrationId,
    role: "localRecipe",
  });
  const module = await import(pathToFileURL(selectedRole.resolvedPath).href);
  if (module.localRecipe === undefined)
    throw new Error(`Local recipe export for "${integrationId}" is unavailable.`);
  return module.localRecipe as LocalServiceRecipe;
}

function assertFunctions(module: Record<string, unknown>, names: readonly string[]): void {
  if (names.some((name) => typeof module[name] !== "function"))
    throw new Error("Local integration runtime exports are invalid.");
}
