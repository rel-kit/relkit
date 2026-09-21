import type { JsonValue } from "@relkit/contracts";
import type { LocalServicePlanEntry, ProviderOverrideState } from "@relkit/local-service";
import { frozenResult } from "./reconciler-lifecycle.js";
import { removeInstance } from "./reconciler-resource.js";
import { sameBindings } from "./reconciler-support.js";
import { summarizeProviderOverrides, writeProviderOverrides } from "./provider-overrides.js";
import { writeLocalServiceState } from "./service-state.js";
import type {
  LocalServiceReconcileRequest,
  LocalServiceReconcilerOptions,
} from "./reconciler-types.js";
import type { TrackedService } from "./reconciler-operation.js";

export async function finalizeReconcile(
  options: LocalServiceReconcilerOptions,
  request: LocalServiceReconcileRequest,
  desired: readonly LocalServicePlanEntry[],
  previous: ProviderOverrideState | undefined,
  next: Map<string, TrackedService>,
  tracked: Map<string, TrackedService>,
  signatures: Map<string, string>,
  bindings: { bindingId: string; values: Readonly<Record<string, JsonValue>> }[],
  reused: string[],
  started: string[],
  removed: string[],
) {
  const desiredIds = new Set(desired.map((entry) => entry.bindingId));
  for (const [bindingId, service] of tracked) {
    if (desiredIds.has(bindingId) || !service.owned) continue;
    await removeInstance(options, service.instance, request.signal);
    removed.push(bindingId);
  }
  bindings.sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  const overrides = summarizeOrWriteOverrides(options, request, previous, bindings);
  const state = writeLocalServiceState(
    options.identity,
    request.planHash,
    request.plan.services.map((entry) => {
      const service = next.get(entry.bindingId)?.instance;
      const serviceGeneration =
        request.serviceGenerations?.[entry.bindingId] ?? request.serviceGeneration;
      return {
        bindingId: entry.bindingId,
        recipe: entry.recipe,
        phase: desiredIds.has(entry.bindingId) ? "healthy" : "stopped",
        ...(request.environment === undefined ? {} : { environment: request.environment }),
        ...(serviceGeneration === undefined ? {} : { serviceGeneration }),
        ...(service?.units === undefined
          ? {}
          : { units: service.units.map((unit) => unit.unitId ?? unit.id) }),
      };
    }),
  );
  tracked.clear();
  signatures.clear();
  for (const [bindingId, service] of next) {
    tracked.set(bindingId, service);
    signatures.set(bindingId, service.signature);
  }
  return frozenResult(overrides, state, reused, started, removed);
}

function summarizeOrWriteOverrides(
  options: LocalServiceReconcilerOptions,
  request: LocalServiceReconcileRequest,
  previous: ProviderOverrideState | undefined,
  bindings: readonly { bindingId: string; values: Readonly<Record<string, JsonValue>> }[],
) {
  return previous !== undefined && sameBindings(previous, request.planHash, bindings)
    ? summarizeProviderOverrides(previous)
    : writeProviderOverrides(options.identity, request.planHash, bindings);
}
