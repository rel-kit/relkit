import { Effect } from "effect";
import { hashGeneratedArtifact } from "@relkit/compiler";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { localCapabilitiesLayer } from "../services/local-capabilities.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import { loadLocalRuntimeModulesEffect } from "./local-runtime-modules.js";
import { formatServices, loadLocalProjectEffect, processAlive } from "./local-operation-support.js";
import { requireLocalMaterializer } from "./local-materializer.js";
import { selectPlan } from "./local-plan.js";
import type { LocalOperationContext } from "./local.types.js";

/**
 * Inspects selected services without acquiring a mutation lease.
 * @param projectRoot - Authored root.
 * @param context - Existing result reporter.
 * @param service - Optional binding/profile/capability.
 * @param environment - Retained environment selector.
 * @returns Portable status from native state and materializer listing.
 */
export const localStatusEffect = Effect.fn("Local.status")(
  function* (
    projectRoot: string,
    context: LocalOperationContext,
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
    const [containers, state] = yield* Effect.all(
      [
        ownedNativePromise("local.list", (signal) => materializer.list(labels, signal)),
        cliTry("local.state", () => local.readLocalServiceState(identity)),
      ],
      { concurrency: 2 },
    );
    const lease = yield* cliTry("local.lease.read", () => local.readLocalProjectLease(identity));
    const grouped = yield* cliTry("local.groupInstances", () =>
      local.groupServiceInstances(containers),
    );
    const byBinding = new Map(
      grouped.map((container) => [container.labels["dev.relkit.binding-id"], container]),
    );
    const prior = new Map(state?.services.map((entry) => [entry.bindingId, entry]));
    const services = localPlan.services.map((entry) => {
      const container = byBinding.get(entry.bindingId);
      const expectedUnits = prior.get(entry.bindingId)?.units;
      const actualUnits = container?.units?.map((unit) => unit.unitId);
      const incomplete =
        expectedUnits !== undefined &&
        actualUnits !== undefined &&
        (expectedUnits.length !== actualUnits.length ||
          expectedUnits.some((unit) => !actualUnits.includes(unit)));
      return {
        bindingId: entry.bindingId,
        recipe: entry.recipe,
        phase: incomplete
          ? "unhealthy"
          : (container?.health ?? prior.get(entry.bindingId)?.phase ?? "stopped"),
        ...(container === undefined ? {} : { containerState: container.state }),
      };
    });
    const output = {
      ok: true as const,
      command: "status" as const,
      applicationId: identity.applicationId,
      localProjectId: identity.localProjectId,
      planHash: state?.planHash ?? hashGeneratedArtifact(project.checked.outputs.localServices),
      ownership:
        lease === undefined
          ? undefined
          : {
              mode: lease.mode,
              sessionId: lease.sessionId,
              blocked: lease.mode === "attached" && processAlive(lease.ownerPid),
            },
      services,
    };
    yield* Effect.sync(() => context.reporter.output(output, formatServices(services)));
  },
  (
    effect,
    _root: string,
    _context: LocalOperationContext,
    _service?: string,
    _environment?: string,
  ) => observeCli("local.status", effect),
);

/**
 * Retains the standalone status Promise adapter.
 * @param projectRoot - Authored root.
 * @param context - Reporter and cancellation.
 * @param service - Optional service filter.
 * @param environment - Retained environment selector.
 * @returns Published status after native listing settles.
 */
export function localStatus(
  projectRoot: string,
  context: LocalOperationContext,
  service?: string,
  environment?: string,
): Promise<void> {
  return runCliEffect(
    localStatusEffect(projectRoot, context, service, environment),
    localCapabilitiesLayer,
    context.signal,
  );
}
