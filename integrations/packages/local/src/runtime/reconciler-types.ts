import type {
  LocalServiceMaterializerRuntime,
  LocalServicePlan,
  LocalServiceRecipeInput,
  LocalServiceState,
  LocalServiceWorkerArtifact,
} from "@relkit/local-service";
import type { LocalProjectIdentity } from "./identity.js";
import type { ProviderOverrideSummary } from "./provider-overrides.js";

export type LocalServiceRecipeMap = Readonly<Record<string, LocalServiceRecipeInput>>;

export interface LocalServiceReconcileRequest {
  readonly plan: LocalServicePlan;
  readonly planHash: string;
  readonly recipes: LocalServiceRecipeMap;
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
