import type { ApplicationGraph } from "@relkit/graph";
import type { LocalServicePlan } from "@relkit/local-service";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import type { EffectLocalServiceOwner } from "./dev-local-runtime.types.js";
/** Owner-validated compiler cohort shared by local service and worker activation. */
export interface CheckedLocalArtifacts {
  readonly graph: ApplicationGraph;
  readonly localPlan: LocalServicePlan;
  readonly runtimePlan: RuntimeIntegrationPlan;
}
/** Reconciliation evidence accepted by the candidate compiler. */
export interface DevLocalReconcileResult {
  readonly owner: EffectLocalServiceOwner;
  readonly inspectorState: string;
  readonly generationId?: string;
  readonly workerBindings: readonly string[];
}
