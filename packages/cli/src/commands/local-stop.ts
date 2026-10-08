import { randomUUID } from "node:crypto";
import { Cause, Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import { localCapabilitiesLayer } from "../services/local-capabilities.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import { loadLocalRuntimeModulesEffect } from "./local-runtime-modules.js";
import { loadLocalProjectEffect } from "./local-operation-support.js";
import { requireLocalMaterializer } from "./local-materializer.js";
import { selectPlan } from "./local-plan.js";
import type { LocalOperationContext } from "./local.types.js";

/**
 * Stops or resets owned project resources under an exclusive attached lease.
 * @param projectRoot - Authored root.
 * @param reset - Whether to remove volumes, networks, and local state.
 * @param context - Existing reporter.
 * @param dryRun - Whether to report only without lease/mutation acquisition.
 * @param service - Retained optional binding selection.
 * @param environment - Retained environment selector.
 * @returns Completion after native mutations and lease release settle.
 */
export const localStopEffect = Effect.fn("Local.stop")(
  function* (
    projectRoot: string,
    reset: boolean,
    context: LocalOperationContext,
    dryRun = false,
    service?: string,
    environment?: string,
  ) {
    const project = yield* loadLocalProjectEffect(projectRoot);
    const localPlan = yield* cliTry("local.selectPlan", () =>
      selectPlan(project.localPlan, service),
    );
    const materializerId = yield* cliTry("local.materializer", () =>
      requireLocalMaterializer(localPlan.services.map((entry) => entry.materializerId)),
    );
    const { local, materializer } = yield* loadLocalRuntimeModulesEffect(
      project.root,
      materializerId,
    );
    const identity = yield* cliTry("local.identity", () =>
      local.createLocalProjectIdentity(project.root, project.applicationId),
    );
    const labels = yield* cliTry("local.labels", () => local.localProjectLabels(identity));
    if (dryRun) {
      const listed = yield* ownedNativePromise("local.list", (signal) =>
        materializer.list(labels, signal),
      );
      const selected = new Set(localPlan.services.map((entry) => entry.bindingId));
      const existing =
        service === undefined
          ? listed
          : listed.filter((entry) => selected.has(entry.labels["dev.relkit.binding-id"] ?? ""));
      const volumes =
        reset && service === undefined && materializer.listVolumes !== undefined
          ? yield* ownedNativePromise("local.listVolumes", (signal) =>
              materializer.listVolumes!(labels, signal),
            )
          : [];
      const output = {
        ok: true as const,
        command: "reset" as const,
        dryRun: true as const,
        localProjectId: identity.localProjectId,
        containers: existing.length,
        containerNames: existing.map((entry) => entry.name).sort(),
        volumes: volumes.map((entry) => entry.name).sort(),
        volumesWouldRemove: true,
        volumesRemoved: false,
      };
      yield* Effect.sync(() =>
        context.reporter.output(
          output,
          `Would reset ${existing.length} local container${existing.length === 1 ? "" : "s"}.`,
        ),
      );
      return;
    }
    const existing = yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          cliTry("local.lease.acquire", () =>
            local.acquireLocalProjectLease(identity, {
              mode: "attached",
              sessionId: `local-${reset ? "reset" : "stop"}-${randomUUID()}`,
            }),
          ),
          (lease) =>
            cleanupEffect(
              "local.lease.release",
              cliTry("local.lease.release", () => lease.release()),
            ),
        );
        const existing = yield* ownedNativePromise("local.list", (signal) =>
          materializer.list(labels, signal),
        );
        const grouped = yield* cliTry("local.groupInstances", () =>
          local.groupServiceInstances(existing),
        );
        const cleanup = yield* CliCleanup;
        for (const entry of grouped) {
          const ids = yield* cliTry("local.instanceIds", () => local.serviceInstanceIds(entry));
          for (const id of [...ids].reverse()) {
            if (materializer.stop !== undefined)
              yield* ownedNativePromise("local.stop", (signal) =>
                materializer.stop!(id, signal),
              ).pipe(
                Effect.catchTag("CliAdapterError", (error) =>
                  cleanup.record("local.stopBestEffort", Cause.fail(error)),
                ),
              );
            yield* ownedNativePromise("local.remove", (signal) => materializer.remove(id, signal));
          }
        }
        if (reset && service === undefined) {
          yield* ownedNativePromise("local.removeVolumes", (signal) =>
            materializer.removeVolumes(labels, signal),
          );
          if (materializer.removeNetworks !== undefined)
            yield* ownedNativePromise("local.removeNetworks", (signal) =>
              materializer.removeNetworks!(labels, signal),
            );
        }
        for (const name of [
          "provider-overrides.json",
          "worker-provider-overrides.json",
          "local-services.state.json",
          "lease.json",
          "local-secrets.json",
        ] as const)
          yield* cliTry("local.removeState", () => local.removeLocalStateFile(identity, name));
        return existing;
      }),
    );
    const output = {
      ok: true as const,
      command: reset ? ("reset" as const) : ("stop" as const),
      localProjectId: identity.localProjectId,
      containers: existing.length,
      volumesRemoved: reset,
    };
    yield* Effect.sync(() =>
      context.reporter.output(
        output,
        `${reset ? "Reset" : "Stopped"} ${existing.length} local container${existing.length === 1 ? "" : "s"}.`,
      ),
    );
  },
  (
    effect,
    _root: string,
    _reset: boolean,
    _context: LocalOperationContext,
    _dryRun = false,
    _service?: string,
    _environment?: string,
  ) => observeCli("local.stop", effect),
);

/**
 * Retains the standalone stop/reset Promise adapter.
 * @param projectRoot - Authored root.
 * @param reset - Whether to remove persistent resources.
 * @param context - Reporter and cancellation.
 * @param dryRun - Inspection-only mode.
 * @param service - Optional service filter.
 * @param environment - Retained environment selector.
 * @returns Completion after native mutations and lease release.
 */
export function localStop(
  projectRoot: string,
  reset: boolean,
  context: LocalOperationContext,
  dryRun = false,
  service?: string,
  environment?: string,
): Promise<void> {
  return runCliEffect(
    localStopEffect(projectRoot, reset, context, dryRun, service, environment),
    localCapabilitiesLayer,
    context.signal,
  );
}
