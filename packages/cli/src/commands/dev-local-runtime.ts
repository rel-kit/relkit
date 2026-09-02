import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PROVIDER_OVERRIDE_STATE_FILE } from "@relkit/local-service";
import { loadLocalRuntimeModules, type LoadedLocalReconciler } from "./local-runtime-modules.js";

export { loadLocalRecipe } from "./local-runtime-modules.js";

export interface DevLocalServiceOwner {
  readonly applicationId: string;
  readonly overrideFile: string;
  readonly inspectorLease: Readonly<{
    readonly mode: "attached" | "detached";
    readonly status: "acquired" | "adopted" | "recovered";
  }>;
  readonly reconciler: LoadedLocalReconciler;
  readonly close: () => Promise<void>;
}

export async function loadDevLocalServiceOwner(
  projectRoot: string,
  applicationId: string,
  materializerId: string,
  mode: "attached" | "detached" = "attached",
): Promise<DevLocalServiceOwner> {
  const { local, materializer } = await loadLocalRuntimeModules(projectRoot, materializerId);
  const identity = local.createLocalProjectIdentity(projectRoot, applicationId);
  const lease = local.acquireLocalProjectLease(identity, {
    mode,
    sessionId: `${mode}-${randomUUID()}`,
  });
  try {
    const reconciler = local.createLocalServiceReconciler({
      identity,
      materializer,
      preserveOnClose: mode === "detached" || lease.status === "adopted",
    });
    let closed = false;
    return Object.freeze({
      applicationId,
      overrideFile: join(local.localStateDirectory(identity), PROVIDER_OVERRIDE_STATE_FILE),
      inspectorLease: Object.freeze({
        mode: lease.status === "adopted" ? "detached" : lease.lease.mode,
        status: lease.status,
      }),
      reconciler,
      close: async () => {
        if (closed) return;
        closed = true;
        try {
          await reconciler.close();
        } finally {
          lease.release();
        }
      },
    });
  } catch (error) {
    lease.release();
    throw error;
  }
}
