import { Deferred, Effect, Exit, Ref, Scope, Semaphore } from "effect";
import { isStableId, type RuntimeIntegrationPlan } from "@relkit/contracts";
import { resolve } from "node:path";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliProject } from "../services/project.service.js";
import { CliCompiler } from "../services/compiler.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliModules } from "../services/modules.service.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import { checkDevProjectEffect } from "./dev-check.js";
import { formatDevDiagnostics } from "./dev-local-diagnostics.js";
import {
  checkedLocalArtifacts,
  localPlanFrom,
  reconcileLocalServicesEffect,
} from "./dev-local-services.js";
import { acquireLocalServiceOwnerEffect } from "./dev-local-runtime.js";
import { makeDevRecipeCacheEffect } from "./dev-recipe-cache.js";
import {
  localWorkerArtifacts,
  prepareLocalWorkerOverridesEffect,
} from "./local-service-options.js";
import { makeDevCompilerBridgeEffect } from "./dev-compiler-bridge.js";
import { telemetryConfigurationFromGraphEffect } from "./dev-telemetry.js";
import type { EffectLocalServiceOwner } from "./dev-local-runtime.types.js";
import type { DevCompilerOptions, EffectDevLocalCompiler } from "./dev-local.types.js";

/**
 * Owns one compiler callback worker, local lease and success-only recipe cache.
 * @param options - Session policy and native telemetry hook.
 * @returns Captured native compilation and a scoped foreign SDK callback bridge.
 */
export const makeDevLocalCompilerEffect = Effect.fn("Dev.localCompiler")(
  function* (options: DevCompilerOptions) {
    const project = yield* CliProject;
    const compiler = yield* CliCompiler;
    const files = yield* CliFileSystem;
    const modules = yield* CliModules;
    const cleanup = yield* CliCleanup;
    const workerScope = yield* Scope.make();
    const resourceScope = yield* Scope.make();
    const owner = yield* Ref.make<EffectLocalServiceOwner | undefined>(undefined);
    const currentPlan = yield* Ref.make<RuntimeIntegrationPlan | undefined>(undefined);
    const serial = yield* Semaphore.make(1);
    const closing = yield* Ref.make(false);
    const closed = yield* Deferred.make<void>();
    const capture = <A, E, R>(
      effect: Effect.Effect<A, E, R | CliCompiler | CliFileSystem | CliModules | CliCleanup>,
    ) =>
      effect.pipe(
        Effect.provideService(CliCompiler, compiler),
        Effect.provideService(CliFileSystem, files),
        Effect.provideService(CliModules, modules),
        Effect.provideService(CliCleanup, cleanup),
      );
    const recipes = yield* capture(makeDevRecipeCacheEffect(options.projectRoot, currentPlan));
    const invalidateEffect = recipes.invalidate;
    const compileEffect: EffectDevLocalCompiler["compileEffect"] = (request) =>
      observeCli(
        "dev.compiler.generation",
        serial.withPermits(1)(
          Effect.gen(function* () {
            if (yield* Ref.get(closing))
              return yield* cliTry("dev.compiler.closed", () => {
                throw new Error("Development compiler is closed.");
              });
            const checked = yield* capture(
              checkDevProjectEffect({
                projectRoot: options.projectRoot,
                generationId: `dev-${request.token.sourceToken}-${request.token.generationToken}`,
              }),
            );
            if (!checked.ok)
              return yield* cliTry("dev.compiler.diagnostics", () => {
                throw new Error(
                  formatDevDiagnostics(options.projectRoot, checked.diagnostics, options.color),
                );
              });
            if (options.configureTelemetry)
              yield* telemetryConfigurationFromGraphEffect(checked.outputs.graph).pipe(
                Effect.flatMap(options.configureTelemetry),
              );
            let local;
            if (options.localEnabled !== false) {
              const { graph, localPlan, runtimePlan } = yield* cliTry(
                "dev.local.requirements",
                () => checkedLocalArtifacts(options.projectRoot, checked),
              );
              const oldPlan = yield* Ref.get(currentPlan);
              if (oldPlan && oldPlan.graphHash !== runtimePlan.graphHash) yield* invalidateEffect;
              yield* Ref.set(currentPlan, runtimePlan);
              const required = localPlan.services.filter((entry) => entry.requiredBy.length > 0);
              let selected = yield* Ref.get(owner);
              if (required.length || selected) {
                if (!selected) {
                  const materializers = new Set(required.map((entry) => entry.materializerId));
                  if (materializers.size > 1)
                    return yield* cliTry("dev.local.materializer", () => {
                      throw new Error("Local bindings require multiple materializers.");
                    });
                  const applicationId = yield* cliTry("dev.local.identity", () => {
                    if (!isStableId(graph.appId))
                      throw new Error("Local application identity is invalid.");
                    return graph.appId;
                  });
                  selected = yield* capture(
                    acquireLocalServiceOwnerEffect(
                      options.projectRoot,
                      applicationId,
                      [...materializers][0] ?? "docker",
                    ),
                  ).pipe(Effect.provideService(Scope.Scope, resourceScope));
                  yield* Ref.set(owner, selected);
                }
                const values = yield* Effect.forEach(
                  [...new Set(required.map((entry) => entry.recipe.integrationId))],
                  (id) => recipes.get(id).pipe(Effect.map((recipe) => [id, recipe] as const)),
                  { concurrency: 4 },
                );
                local = yield* reconcileLocalServicesEffect(
                  checked,
                  selected,
                  Object.fromEntries(values),
                  options.backendPort ?? 3000,
                );
              }
            }
            const built = yield* project.build({
              projectRoot: options.projectRoot,
              mode: "development",
              buildDirectory: request.outputDirectory,
              check: async () => checked,
              ...(local?.generationId === undefined
                ? {}
                : { providerOverridesGeneration: local.generationId }),
            });
            if (!built.ok)
              return yield* cliTry("dev.build.diagnostics", () => {
                throw new Error(
                  formatDevDiagnostics(options.projectRoot, built.diagnostics, options.color),
                );
              });
            if (local && local.workerBindings.length) {
              const override = yield* capture(
                prepareLocalWorkerOverridesEffect(local.owner.overrideFile),
              );
              const values = yield* Effect.forEach(
                [
                  ...new Set(
                    localPlanFrom(checked)
                      .services.filter((entry) => entry.requiredBy.length)
                      .map((entry) => entry.recipe.integrationId),
                  ),
                ],
                (id) => recipes.get(id).pipe(Effect.map((recipe) => [id, recipe] as const)),
                { concurrency: 4 },
              );
              const artifacts = yield* cliTry("dev.local.workers", () =>
                localWorkerArtifacts(
                  localPlanFrom(checked).services,
                  local!.workerBindings,
                  request.outputDirectory,
                  resolve(options.projectRoot, "node_modules"),
                  override,
                ),
              );
              local = yield* reconcileLocalServicesEffect(
                checked,
                local.owner,
                Object.fromEntries(values),
                options.backendPort ?? 3000,
                true,
                artifacts,
              );
            }
            return {
              entrypoint: "server/index.js",
              ...(local === undefined
                ? {}
                : {
                    environment: {
                      RELKIT_LOCAL_SERVICE_INSPECTOR_STATE: local.inspectorState,
                      ...(local.generationId === undefined
                        ? {}
                        : {
                            RELKIT_PROVIDER_OVERRIDES_FILE: local.owner.overrideFile,
                            ...(local.workerBindings.length ? { RELKIT_WORKER_ROLE: "api" } : {}),
                          }),
                    },
                  }),
            };
          }),
        ),
      );
    const bridge = yield* makeDevCompilerBridgeEffect(compileEffect, workerScope);
    const closeEffect = observeCli(
      "dev.compiler.close",
      Effect.uninterruptible(
        Effect.gen(function* () {
          if (!(yield* Ref.getAndSet(closing, true))) {
            bridge.close();
            yield* Deferred.complete(
              closed,
              Scope.close(workerScope, Exit.void).pipe(
                Effect.andThen(
                  cleanupEffect("dev.local.owner.release", Scope.close(resourceScope, Exit.void)),
                ),
                Effect.provideService(CliCleanup, cleanup),
              ),
            );
          }
          yield* Deferred.await(closed);
        }),
      ),
    );
    yield* Effect.addFinalizer(() => closeEffect);
    return {
      compile: bridge.compile,
      compileEffect,
      invalidateEffect,
      closeEffect,
    } satisfies EffectDevLocalCompiler;
  },
  (effect, _options: DevCompilerOptions) => observeCli("dev.compiler.acquire", effect),
);
