import { Schema } from "effect";
import type { LocalServiceMaterializerRuntime } from "@relkit/local-service";
import type { LoadedLocalRuntime } from "./local-runtime-modules.types.js";

/**
 * Validates a declaration-owned native function export without copying its identity.
 * @typeParam F - Installed native function contract.
 * @returns A Schema checking native callability; semantic output checks belong to its owner.
 */
function nativeFunction<F extends (...args: never[]) => unknown>() {
  return Schema.declare<F>((value): value is F => typeof value === "function");
}

/** Explicit local SDK exports selected through the compiler's contained resolution API. */
export const localRuntimeSchema = Schema.Struct({
  createLocalProjectIdentity: nativeFunction<LoadedLocalRuntime["createLocalProjectIdentity"]>(),
  localProjectLabels: nativeFunction<LoadedLocalRuntime["localProjectLabels"]>(),
  acquireLocalProjectLease: nativeFunction<LoadedLocalRuntime["acquireLocalProjectLease"]>(),
  readLocalProjectLease: nativeFunction<LoadedLocalRuntime["readLocalProjectLease"]>(),
  createLocalServiceReconciler:
    nativeFunction<LoadedLocalRuntime["createLocalServiceReconciler"]>(),
  readLocalServiceState: nativeFunction<LoadedLocalRuntime["readLocalServiceState"]>(),
  localStateDirectory: nativeFunction<LoadedLocalRuntime["localStateDirectory"]>(),
  removeLocalStateFile: nativeFunction<LoadedLocalRuntime["removeLocalStateFile"]>(),
  groupServiceInstances: nativeFunction<LoadedLocalRuntime["groupServiceInstances"]>(),
  serviceInstanceIds: nativeFunction<LoadedLocalRuntime["serviceInstanceIds"]>(),
});
/** Docker module factory contract; the module namespace remains the original import. */
export const dockerRuntimeSchema = Schema.Struct({
  createDockerMaterializer: nativeFunction<() => LocalServiceMaterializerRuntime>(),
});
