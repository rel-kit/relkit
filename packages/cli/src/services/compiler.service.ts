import { Context, Effect, Layer } from "effect";
import * as Compiler from "@relkit/compiler";
import { cliAdapterError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { CompilerCapabilities } from "./compiler.types.js";

/** Compiler execution and artifact authority, separate from module and process ownership. */
export class CliCompiler extends Context.Service<CliCompiler, CompilerCapabilities>()(
  "relkit/cli/Compiler",
) {}

/**
 * Supplies the pinned compiler API at its throwing and asynchronous boundaries.
 * @returns A live compiler Layer; content-aware writes settle before cancellation cleanup.
 */
export const compilerLayer = Layer.effect(
  CliCompiler,
  Effect.gen(function* () {
    const packages = yield* Compiler.CompilerPackageSource;
    const workers = yield* Compiler.JobWorkerStorage;
    return CliCompiler.of({
      loadConfig: Effect.fn("CliCompiler.loadConfig")(
        (...args: Parameters<typeof Compiler.loadConfig>) =>
          observeCli(
            "compiler.loadConfig",
            Compiler.loadConfigEffect(...args).pipe(
              Effect.mapError((error) => cliAdapterError("compiler.loadConfig", error.cause)),
            ),
          ),
      ),
      evaluate: Effect.fn("CliCompiler.evaluate")(
        (...args: Parameters<typeof Compiler.evaluateCandidates>) =>
          observeCli("compiler.evaluate", Compiler.evaluateCandidatesEffect(...args)),
      ),
      typecheck: Effect.fn("CliCompiler.typecheck")(
        (...args: Parameters<typeof Compiler.typecheckProject>) =>
          observeCli("compiler.typecheck", Compiler.typecheckProjectEffect(...args)),
      ),
      integrationPackages: Effect.fn("CliCompiler.integrationPackages")(
        (...args: Parameters<typeof Compiler.resolveRuntimeIntegrationPackages>) =>
          observeCli(
            "compiler.integrationPackages",
            Compiler.resolveRuntimeIntegrationPackagesEffect(...args).pipe(
              Effect.provideService(Compiler.CompilerPackageSource, packages),
              Effect.mapError((error) =>
                cliAdapterError("compiler.integrationPackages", error.cause),
              ),
            ),
          ),
      ),
      integrationRole: Effect.fn("CliCompiler.integrationRole")(
        (...args: Parameters<typeof Compiler.resolveIntegrationPackageRole>) =>
          observeCli(
            "compiler.integrationRole",
            Compiler.resolveIntegrationPackageRoleEffect(...args).pipe(
              Effect.provideService(Compiler.CompilerPackageSource, packages),
              Effect.mapError((error) => cliAdapterError("compiler.integrationRole", error.cause)),
            ),
          ),
      ),
      writeChanged: Effect.fn("CliCompiler.writeChanged")(
        (...args: Parameters<typeof Compiler.writeIfChanged>) =>
          observeCli(
            "compiler.writeChanged",
            Compiler.writeIfChangedEffect(...args).pipe(
              Effect.mapError((error) => cliAdapterError("compiler.writeChanged", error.cause)),
            ),
          ),
      ),
      writeArtifacts: Effect.fn("CliCompiler.writeArtifacts")(
        (...args: Parameters<typeof Compiler.writeGeneratedArtifacts>) =>
          observeCli(
            "compiler.writeArtifacts",
            Compiler.writeGeneratedArtifactsEffect(...args).pipe(
              Effect.mapError((error) => cliAdapterError("compiler.writeArtifacts", error.cause)),
            ),
          ),
      ),
      writeWorkers: Effect.fn("CliCompiler.writeWorkers")(
        (...args: Parameters<typeof Compiler.writeJobWorkerEntries>) =>
          observeCli(
            "compiler.writeWorkers",
            Compiler.writeJobWorkerEntriesWithStorageEffect(...args).pipe(
              Effect.provideService(Compiler.JobWorkerStorage, workers),
              Effect.mapError((error) =>
                cliAdapterError(
                  "compiler.writeWorkers",
                  error._tag === "JobWorkerPathError" || error._tag === "JobWorkerStorageError"
                    ? error.cause
                    : error,
                ),
              ),
            ),
          ),
      ),
    });
  }),
).pipe(
  Layer.provide(Layer.merge(Compiler.CompilerPackageSourceLive, Compiler.JobWorkerStorageLive)),
);
