import { Context, Effect, Layer } from "effect";
import {
  prepareDeploymentEffect,
  openDeploymentWorkspaceEffect,
} from "../commands/deploy-preparation.js";
import { executeDeployEffect } from "../commands/deploy-operations.js";
import type {
  DeployCommandOptions,
  DeployContext,
  ParsedDeployArgs,
} from "../commands/deploy-support.types.js";
import { observeCli } from "../cli-runtime.js";
import { CliProject, projectLiveLayer } from "./project.service.js";
import { CliCompiler, compilerLayer } from "./compiler.service.js";
import { CliFileSystem, fileSystemLayer } from "./filesystem.service.js";
import { CliModules, moduleLayer } from "./modules.service.js";
import { CliPulumi, pulumiLayer } from "./pulumi.service.js";
import { CliDeployConfirmation, deployConfirmationLayer } from "./deploy-confirmation.service.js";
import type { DeploymentCapabilities } from "./deployment.types.js";

/** Cohesive deployment domain with narrow captured native authorities. */
export class CliDeployment extends Context.Service<CliDeployment, DeploymentCapabilities>()(
  "relkit/cli/Deployment",
) {}

/**
 * Captures deployment adapters once; acquisition performs no SDK operation.
 * @param options - Existing authorized public adapter substitutes.
 * @returns A domain Layer with explicit inputs and no hidden method requirements.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const result = Effect.gen(function* () {
 *   const deployment = yield* CliDeployment;
 *   return yield* deployment.run(process.cwd(), {
 *     command: "preview", stack: "development", backend: { kind: "local" }, config: {}, nonInteractive: true,
 *   }, { json: true, reporter: { output: () => undefined, error: () => undefined } });
 * }).pipe(Effect.provide(deploymentLiveLayer()));
 * ```
 */
export function deploymentLayer(options: DeployCommandOptions = {}) {
  return Layer.effect(
    CliDeployment,
    Effect.gen(function* () {
      const project = yield* CliProject;
      const compiler = yield* CliCompiler;
      const files = yield* CliFileSystem;
      const modules = yield* CliModules;
      const sdk = yield* CliPulumi;
      const consent = yield* CliDeployConfirmation;
      return CliDeployment.of({
        run: Effect.fn("CliDeployment.run")(
          (root: string, parsed: ParsedDeployArgs, context: DeployContext) =>
            observeCli(
              "deployment.run",
              Effect.gen(function* () {
                const prepared = yield* prepareDeploymentEffect(root, parsed, options);
                yield* Effect.yieldNow;
                const workspace = yield* openDeploymentWorkspaceEffect(prepared, parsed);
                yield* Effect.yieldNow;
                return yield* executeDeployEffect(prepared, workspace, parsed, context);
              }).pipe(
                Effect.provideService(CliProject, project),
                Effect.provideService(CliCompiler, compiler),
                Effect.provideService(CliFileSystem, files),
                Effect.provideService(CliModules, modules),
                Effect.provideService(CliPulumi, sdk),
                Effect.provideService(CliDeployConfirmation, consent),
              ),
            ),
        ),
      });
    }),
  );
}

/**
 * Supplies one invocation-owned deployment graph, acquired only for the selected branch.
 * @param options - Public compatibility substitutes for native boundaries.
 * @returns The live deployment domain Layer; previews acquire no background process.
 */
export function deploymentLiveLayer(options: DeployCommandOptions = {}) {
  return deploymentLayer(options).pipe(
    Layer.provide(
      Layer.mergeAll(
        projectLiveLayer,
        compilerLayer,
        fileSystemLayer,
        moduleLayer,
        pulumiLayer(options),
        deployConfirmationLayer(options),
      ),
    ),
  );
}
