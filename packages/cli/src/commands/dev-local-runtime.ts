import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Deferred, Effect, Layer, Ref } from "effect";
import { PROVIDER_OVERRIDE_STATE_FILE } from "@relkit/local-service";
import { cliPromise, cliTry, type CliAdapterError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";
import { compilerLayer } from "../services/compiler.service.js";
import { moduleLayer } from "../services/modules.service.js";
import { loadLocalRuntimeModulesEffect } from "./local-runtime-modules.js";
import type { DevLocalServiceOwner, EffectLocalServiceOwner } from "./dev-local-runtime.types.js";
export { loadLocalRecipe, loadLocalRecipeEffect } from "./local-runtime-modules.js";
export type { DevLocalServiceOwner, EffectLocalServiceOwner } from "./dev-local-runtime.types.js";

/**
 * Constructs one lease/reconciler owner for a manual compatibility lifetime.
 * @param projectRoot - Authored resolution root.
 * @param applicationId - Accepted application identity.
 * @param materializerId - Selected native materializer.
 * @param mode - Attached cleanup or preserved detached resources.
 * @returns A native owner whose closeEffect joins all concurrent close callers.
 */
const makeLocalServiceOwnerEffect = Effect.fn("Local.makeOwner")(
  function* (
    projectRoot: string,
    applicationId: string,
    materializerId: string,
    mode: "attached" | "detached",
  ) {
    const cleanup = yield* CliCleanup;
    const { local, materializer } = yield* loadLocalRuntimeModulesEffect(
      projectRoot,
      materializerId,
    );
    const identity = yield* cliTry("local.identity", () =>
      local.createLocalProjectIdentity(projectRoot, applicationId),
    );
    const overrideFile = yield* cliTry("local.override.path", () =>
      join(local.localStateDirectory(identity), PROVIDER_OVERRIDE_STATE_FILE),
    );
    const lease = yield* cliTry("local.lease.acquire", () =>
      local.acquireLocalProjectLease(identity, { mode, sessionId: `${mode}-${randomUUID()}` }),
    );
    const release = cleanupEffect(
      "local.lease.release",
      cliTry("local.lease.release", () => lease.release()),
    ).pipe(Effect.provideService(CliCleanup, cleanup));
    const reconciler = yield* cliTry("local.reconciler.acquire", () =>
      local.createLocalServiceReconciler({
        identity,
        materializer,
        preserveOnClose: mode === "detached" || lease.status === "adopted",
      }),
    ).pipe(Effect.onError(() => release));
    const closing = yield* Ref.make(false);
    const closed = yield* Deferred.make<void, CliAdapterError>();
    const closeEffect = observeCli(
      "local.owner.close",
      Effect.uninterruptible(
        Effect.gen(function* () {
          if (!(yield* Ref.getAndSet(closing, true))) {
            yield* Deferred.complete(
              closed,
              cliPromise("local.reconciler.close", () => reconciler.close()).pipe(
                Effect.ensuring(release),
              ),
            );
          }
          yield* Deferred.await(closed);
        }),
      ),
    );
    return Object.freeze({
      applicationId,
      overrideFile,
      inspectorLease: Object.freeze({
        mode: lease.status === "adopted" ? ("detached" as const) : lease.lease.mode,
        status: lease.status,
      }),
      reconciler,
      closeEffect,
      close: () => runCliEffect(closeEffect, Layer.empty),
    }) satisfies EffectLocalServiceOwner;
  },
  (effect, _root: string, _app: string, _materializer: string, _mode: "attached" | "detached") =>
    observeCli("local.owner.acquire", effect.pipe(Effect.uninterruptible)),
);

/**
 * Acquires a lease/reconciler whose release belongs to the surrounding operation scope.
 * @param projectRoot - Authored resolution root.
 * @param applicationId - Accepted application identity.
 * @param materializerId - Selected native materializer.
 * @param mode - Attached cleanup or retained detached resources.
 * @returns The owner; cleanup evidence cannot replace a primary operation failure.
 */
export function acquireLocalServiceOwnerEffect(
  projectRoot: string,
  applicationId: string,
  materializerId: string,
  mode: "attached" | "detached" = "attached",
) {
  return Effect.acquireRelease(
    makeLocalServiceOwnerEffect(projectRoot, applicationId, materializerId, mode),
    (owner) => cleanupEffect("local.owner.release", owner.closeEffect),
  );
}

/**
 * Retains the manual public owner/close Promise boundary used by existing consumers.
 * @param projectRoot - Authored resolution root.
 * @param applicationId - Accepted application identity.
 * @param materializerId - Selected native materializer.
 * @param mode - Existing attached/detached policy.
 * @returns The owner; callers must close it, while native workflows use scoped acquisition.
 */
export function loadDevLocalServiceOwner(
  projectRoot: string,
  applicationId: string,
  materializerId: string,
  mode: "attached" | "detached" = "attached",
): Promise<DevLocalServiceOwner> {
  return runCliEffect(
    makeLocalServiceOwnerEffect(projectRoot, applicationId, materializerId, mode),
    Layer.mergeAll(compilerLayer, moduleLayer, cleanupLayer),
  );
}
