import { Context, Effect, Layer } from "effect";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { readBuiltWorkflow } from "./start-built-workflow.js";
import type { BuiltProject, BuiltProjectOperations } from "./start-built.types.js";
export type { BuiltManifest } from "./start-built.types.js";

/** Coherent build-artifact authority used by production startup. */
export class CliBuiltProject extends Context.Service<CliBuiltProject, BuiltProjectOperations>()(
  "relkit/cli/BuiltProject",
) {}

/** Captures read-only file capabilities; no application module executes during acquisition. */
export const builtProjectLive = Layer.effect(
  CliBuiltProject,
  Effect.gen(function* () {
    const files = yield* CliFileSystem;
    return CliBuiltProject.of({
      read: (directory) =>
        readBuiltWorkflow(directory).pipe(Effect.provideService(CliFileSystem, files)),
    });
  }),
);

/** Native finite build reader dependency graph. */
export const builtProjectLayer = builtProjectLive.pipe(Layer.provide(fileSystemLayer));

/**
 * Reads a validated cohort through the provided build authority.
 * @param buildDirectory - Selected emitted build root.
 * @returns A lazy current manifest/graph identity requiring CliBuiltProject.
 */
export const readBuiltEffect = Effect.fn("BuiltProject.read")(
  (buildDirectory: string) => CliBuiltProject.use((built) => built.read(buildDirectory)),
  (effect) => observeCli("start.built.read", effect),
);

/**
 * Preserves the build reader's public Promise and diagnostic contracts.
 * @param buildDirectory - Selected emitted build root.
 * @returns Validated build identity after finite file reads.
 */
export function readBuilt(buildDirectory: string): Promise<BuiltProject> {
  return runCliEffect(readBuiltEffect(buildDirectory), builtProjectLayer);
}
