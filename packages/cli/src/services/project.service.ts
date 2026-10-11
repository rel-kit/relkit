import { Context, Effect, Layer } from "effect";
import { buildProjectEffect } from "../commands/build.js";
import { checkDevProjectEffect } from "../commands/dev-check.js";
import { CliCompiler } from "./compiler.service.js";
import { CliFileSystem } from "./filesystem.service.js";
import { CliModules } from "./modules.service.js";
import { CliProcess } from "./process.service.js";
import { CliCleanup } from "./cleanup.service.js";
import { buildCapabilitiesLayer } from "./project-capabilities.js";
import type { ProjectCapabilities } from "./project.types.js";
import { SnapshotFiles, snapshotFilesLive } from "../dev-snapshot/snapshot-files.service.js";
import { checkProjectWithCurrentReceiptEffect } from "../dev-snapshot/snapshot-check-execution.js";

/** Project authoring domain; compilation/build resources belong to individual operation scopes. */
export class CliProject extends Context.Service<CliProject, ProjectCapabilities>()(
  "relkit/cli/Project",
) {}

/**
 * Captures explicit project adapters once, without executing compilation during acquisition.
 * @returns A domain Layer whose methods retain exact failures and own their operation scopes.
 * @remarks Development checks use an isolated compiler group. Each call joins
 * its process and descendants before returning or propagating interruption.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const checked = await Effect.runPromise(Effect.gen(function* () {
 *   const project = yield* CliProject;
 *   return yield* project.check({ projectRoot: process.cwd() });
 * }).pipe(Effect.provide(projectLiveLayer)));
 * const development = await Effect.runPromise(CliProject.use((project) =>
 *   project.checkDevelopment({ projectRoot: process.cwd(), generationId: "initial" })
 * ).pipe(Effect.provide(projectLiveLayer)));
 * ```
 */
export const projectLayer = Layer.effect(
  CliProject,
  Effect.gen(function* () {
    const compiler = yield* CliCompiler;
    const files = yield* CliFileSystem;
    const modules = yield* CliModules;
    const processes = yield* CliProcess;
    const cleanup = yield* CliCleanup;
    const snapshotFiles = yield* SnapshotFiles;
    return CliProject.of({
      check: (options) =>
        checkProjectWithCurrentReceiptEffect(options).pipe(
          Effect.provideService(CliCompiler, compiler),
          Effect.provideService(CliFileSystem, files),
          Effect.provideService(CliModules, modules),
          Effect.provideService(SnapshotFiles, snapshotFiles),
        ),
      checkDevelopment: (request) =>
        checkDevProjectEffect(request).pipe(Effect.provideService(CliCleanup, cleanup)),
      build: (options) =>
        buildProjectEffect(options).pipe(
          Effect.provideService(CliCompiler, compiler),
          Effect.provideService(CliFileSystem, files),
          Effect.provideService(CliModules, modules),
          Effect.provideService(CliProcess, processes),
          Effect.provideService(CliCleanup, cleanup),
        ),
    });
  }),
);

/** Invocation-owned live project graph; tests replace projectLayer's capability inputs. */
export const projectLiveLayer = projectLayer.pipe(
  Layer.provide(Layer.merge(buildCapabilitiesLayer, snapshotFilesLive)),
);
