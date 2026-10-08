import { Context, Effect, Layer } from "effect";
import { observeCli } from "../cli-runtime.js";
import { executeLocalEffect } from "../commands/local-command-operation.js";
import type {
  LocalCommandContext,
  LocalCommandDependencies,
  ParsedLocalArgs,
} from "../commands/local.types.js";
import { CliProject } from "./project.service.js";
import { CliCompiler } from "./compiler.service.js";
import { CliModules } from "./modules.service.js";
import { CliFileSystem } from "./filesystem.service.js";
import { CliCleanup } from "./cleanup.service.js";
import { localCapabilitiesLayer } from "./local-capabilities.js";
import type { LocalCapabilities } from "./local.types.js";

/** Local lifecycle domain; resource ownership remains inside each selected operation. */
export class CliLocal extends Context.Service<CliLocal, LocalCapabilities>()("relkit/cli/Local") {}

/**
 * Captures only local workflow authorities, without listing or starting containers.
 * @param dependencies - Authorized compatibility confirmation substitute.
 * @returns A domain Layer whose methods own their scopes and preserve interruption.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const program = Effect.gen(function* () {
 *   const local = yield* CliLocal;
 *   return yield* local.run({ command: "status", projectRoot: process.cwd(), detach: false, yes: false, dryRun: false }, {
 *     json: true, signal: new AbortController().signal, reporter: { output: () => undefined, error: () => undefined },
 *   });
 * }).pipe(Effect.provide(localLiveLayer()));
 * ```
 */
export function localLayer(dependencies: LocalCommandDependencies = {}) {
  return Layer.effect(
    CliLocal,
    Effect.gen(function* () {
      const project = yield* CliProject;
      const compiler = yield* CliCompiler;
      const modules = yield* CliModules;
      const files = yield* CliFileSystem;
      const cleanup = yield* CliCleanup;
      return CliLocal.of({
        run: Effect.fn("CliLocal.run")((parsed: ParsedLocalArgs, context: LocalCommandContext) =>
          observeCli(
            "local.run",
            executeLocalEffect(parsed, context, dependencies).pipe(
              Effect.provideService(CliProject, project),
              Effect.provideService(CliCompiler, compiler),
              Effect.provideService(CliModules, modules),
              Effect.provideService(CliFileSystem, files),
              Effect.provideService(CliCleanup, cleanup),
            ),
          ),
        ),
      });
    }),
  );
}

/**
 * Supplies one local invocation graph with session-only namespace reuse.
 * @param dependencies - Existing public confirmation override.
 * @returns A live local domain Layer, acquired only for selected local commands.
 */
export function localLiveLayer(dependencies: LocalCommandDependencies = {}) {
  return localLayer(dependencies).pipe(Layer.provide(localCapabilitiesLayer));
}
