import type {
  LocalServiceMaterializerRuntime,
  LocalServicePlan,
  LocalServiceRecipe,
  LocalServiceState,
} from "@relkit/local-service";
import type { LocalProjectIdentity } from "./identity.js";
import type { ProviderOverrideSummary } from "./provider-overrides.js";

export type LocalServiceRecipeMap = Readonly<Record<string, LocalServiceRecipe>>;

export interface LocalServiceReconcileRequest {
  readonly plan: LocalServicePlan;
  readonly planHash: string;
  readonly recipes: LocalServiceRecipeMap;
  readonly scope: "required" | "all";
  readonly signal?: AbortSignal;
}

export interface LocalServiceReconcileResult {
  readonly overrides: ProviderOverrideSummary;
  readonly state: LocalServiceState;
  readonly reused: readonly string[];
  readonly started: readonly string[];
  readonly removed: readonly string[];
}

export interface LocalServiceReconcilerOptions {
  readonly identity: LocalProjectIdentity;
  readonly materializer: LocalServiceMaterializerRuntime;
  readonly preserveOnClose?: boolean;
}

export interface LocalServiceReconciler {
  readonly reconcile: (
    request: LocalServiceReconcileRequest,
  ) => Promise<LocalServiceReconcileResult>;
  readonly close: () => Promise<void>;
}
