/** State shared by serialized compilation stages; native resource lifetimes remain owned by the compiler. */
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import type { Deferred, Effect, Ref, Scope } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { CliCleanup } from "../services/cleanup.service.js";
import type { CliProject } from "../services/project.service.js";
import type { CliCompiler } from "../services/compiler.service.js";
import type { CliFileSystem } from "../services/filesystem.service.js";
import type { CliModules } from "../services/modules.service.js";
import type { CheckResult } from "./check-result.types.js";
import type { EffectLocalServiceOwner } from "./dev-local-runtime.types.js";
import type { DevRecipeCache } from "./dev-recipe-cache.types.js";

/** Captured session state; callers hold the compiler's shared serialization permit. */
export interface DevGenerationState {
  readonly owner: Ref.Ref<EffectLocalServiceOwner | undefined>;
  readonly currentPlan: Ref.Ref<RuntimeIntegrationPlan | undefined>;
  readonly recipes: DevRecipeCache;
  readonly resourceScope: Scope.Closeable;
  readonly closing: Ref.Ref<boolean>;
  readonly initialCheck: Ref.Ref<
    Effect.Effect<CheckResult | undefined, CliAdapterError> | undefined
  >;
  readonly invalidateEffect: Effect.Effect<void>;
}

/** One compiler's admission and shared shutdown completion. */
export interface CompilerCloseOptions {
  readonly closeAdmission: () => void;
  readonly workerScope: Scope.Closeable;
  readonly resourceScope: Scope.Closeable;
  readonly closing: Ref.Ref<boolean>;
  readonly closed: Deferred.Deferred<void>;
  readonly cleanup: CliCleanup["Service"];
}

/** Shared dependencies captured once; generation operations have no hidden authority. */
export interface DevCompilerCapabilities {
  readonly project: CliProject["Service"];
  readonly compiler: CliCompiler["Service"];
  readonly files: CliFileSystem["Service"];
  readonly modules: CliModules["Service"];
  readonly cleanup: CliCleanup["Service"];
}
