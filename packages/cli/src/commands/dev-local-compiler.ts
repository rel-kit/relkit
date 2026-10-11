/** Owns the compiler bridge and captured session resources; generation stages live in dev-local-generation. */
import { Deferred, Effect, Exit, Ref, Scope, Semaphore } from "effect";
import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import { observeCli } from "../cli-runtime.js";
import { CliProject } from "../services/project.service.js";
import { CliCompiler } from "../services/compiler.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliModules } from "../services/modules.service.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import { makeDevRecipeCacheEffect } from "./dev-recipe-cache.js";
import { makeDevCompilerBridgeEffect } from "./dev-compiler-bridge.js";
import { compileDevGenerationEffect } from "./dev-local-generation.js";
import type { EffectLocalServiceOwner } from "./dev-local-runtime.types.js";
import type { DevCompilerOptions, EffectDevLocalCompiler } from "./dev-local.types.js";
import type {
  DevGenerationState,
  CompilerCloseOptions,
  DevCompilerCapabilities,
} from "./dev-local-generation.types.js";

/**
 * Owns one compiler callback worker, local lease and success-only recipe cache.
 * @param options - Session policy and native telemetry hook.
 * @returns Captured native compilation and a scoped foreign SDK callback bridge.
 */
export const makeDevLocalCompilerEffect = Effect.fn("Dev.localCompiler")(
  function* (options: DevCompilerOptions) {
    const capabilities = yield* compilerCapabilities;
    const workerScope = yield* Scope.make();
    const resourceScope = yield* Scope.make();
    const serial = yield* Semaphore.make(1);
    const closed = yield* Deferred.make<void>();
    const state = yield* provideCompilerCapabilities(
      capabilities,
      generationState(options, resourceScope),
    );
    const compileEffect: EffectDevLocalCompiler["compileEffect"] = (request) =>
      observeCli(
        "dev.compiler.generation",
        serial.withPermits(1)(
          provideCompilerCapabilities(
            capabilities,
            compileDevGenerationEffect(options, state, request),
          ),
        ),
      );
    const bridge = yield* makeDevCompilerBridgeEffect(compileEffect, workerScope);
    const closeEffect = compilerCloseEffect({
      closeAdmission: bridge.close,
      workerScope,
      resourceScope,
      closing: state.closing,
      closed,
      cleanup: capabilities.cleanup,
    });
    yield* Effect.addFinalizer(() => closeEffect);
    return {
      compile: bridge.compile,
      compileEffect,
      invalidateEffect: state.invalidateEffect,
      closeEffect,
    } satisfies EffectDevLocalCompiler;
  },
  (effect, _options: DevCompilerOptions) => observeCli("dev.compiler.acquire", effect),
);

/** Captures shared authority once during compiler acquisition. */
const compilerCapabilities = Effect.gen(function* () {
  return {
    project: yield* CliProject,
    compiler: yield* CliCompiler,
    files: yield* CliFileSystem,
    modules: yield* CliModules,
    cleanup: yield* CliCleanup,
  } satisfies DevCompilerCapabilities;
});

/**
 * Provides only shared compiler dependencies while retaining genuine caller requirements.
 * @typeParam A - Workflow success value.
 * @typeParam E - Workflow failures retained unchanged.
 * @typeParam R - Remaining caller authority.
 * @param capabilities - Acquired session dependencies.
 * @param effect - Lazy generation or cache workflow.
 * @returns Provided workflow with all remaining E/R contracts preserved.
 */
function provideCompilerCapabilities<A, E, R>(
  capabilities: DevCompilerCapabilities,
  effect: Effect.Effect<
    A,
    E,
    R | CliProject | CliCompiler | CliFileSystem | CliModules | CliCleanup
  >,
) {
  return effect.pipe(
    Effect.provideService(CliProject, capabilities.project),
    Effect.provideService(CliCompiler, capabilities.compiler),
    Effect.provideService(CliFileSystem, capabilities.files),
    Effect.provideService(CliModules, capabilities.modules),
    Effect.provideService(CliCleanup, capabilities.cleanup),
  );
}

/**
 * Allocates initial validation, recipe epochs and local ownership for one session.
 * @param options - Initial check/discard policy and project root.
 * @param resourceScope - Lifetime owning the eventual local service lease.
 * @returns Mutable state shared only by this compiler's serialized generations.
 */
const generationState = Effect.fn("Dev.generationState")(function* (
  options: DevCompilerOptions,
  resourceScope: Scope.Closeable,
) {
  const owner = yield* Ref.make<EffectLocalServiceOwner | undefined>(undefined);
  const currentPlan = yield* Ref.make<RuntimeIntegrationPlan | undefined>(undefined);
  const recipes = yield* makeDevRecipeCacheEffect(options.projectRoot, currentPlan);
  const initialCheck = yield* Ref.make(options.initialCheck);
  const invalidateEffect = Ref.set(initialCheck, undefined).pipe(
    Effect.andThen(options.discardInitialCheck ?? Effect.void),
    Effect.andThen(recipes.invalidate),
  );
  return {
    owner,
    currentPlan,
    recipes,
    resourceScope,
    closing: yield* Ref.make(false),
    initialCheck,
    invalidateEffect,
  } satisfies DevGenerationState;
});

/**
 * Closes admission and joins both resource scopes once across all shutdown callers.
 * @param options - Shared completion/state and native scopes owned by this compiler.
 * @returns Uninterruptible cleanup after accepted work settles.
 */
function compilerCloseEffect(options: CompilerCloseOptions) {
  return observeCli(
    "dev.compiler.close",
    Effect.uninterruptible(
      Effect.gen(function* () {
        if (!(yield* Ref.getAndSet(options.closing, true))) {
          options.closeAdmission();
          yield* Deferred.complete(
            options.closed,
            Scope.close(options.workerScope, Exit.void).pipe(
              Effect.andThen(
                cleanupEffect(
                  "dev.local.owner.release",
                  Scope.close(options.resourceScope, Exit.void),
                ),
              ),
              Effect.provideService(CliCleanup, options.cleanup),
            ),
          );
        }
        yield* Deferred.await(options.closed);
      }),
    ),
  );
}
