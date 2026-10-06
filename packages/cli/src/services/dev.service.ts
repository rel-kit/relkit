import { Context, Effect, Layer } from "effect";
import { devCommandOperationEffect } from "../commands/dev-command-operation.js";
import { CliCompiler } from "./compiler.service.js";
import { CliFileSystem } from "./filesystem.service.js";
import { CliModules } from "./modules.service.js";
import { CliCleanup } from "./cleanup.service.js";
import { CliProject } from "./project.service.js";
import { CliDevSupervisor } from "./dev-supervisor.service.js";
import { CliSourceWatch } from "./source-watch.service.js";
import { CliPortProbe } from "../commands/port-availability.service.js";
import {
  CliTelemetryNative,
  telemetryNativeLayer,
} from "../commands/dev-telemetry-native.service.js";
import { localCapabilitiesLayer } from "./local-capabilities.js";
import { devSessionCapabilitiesLayer } from "../commands/dev-session-engine.js";
import type { DevOperations } from "./dev.types.js";

/** Development domain capturing authority without importing configuration during acquisition. */
export class CliDev extends Context.Service<CliDev, DevOperations>()("relkit/cli/Dev") {}

/**
 * Captures explicit project, generation, telemetry and native adapters once.
 * @returns A replaceable domain Layer; run retains the caller's session Scope.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import type { CliCommandContext } from "../main-support-types.js";
 * declare const context: CliCommandContext;
 * await Effect.runPromise(Effect.scoped(CliDev.use((dev) => dev.run([], context))).pipe(Effect.provide(devLiveLayer())));
 * ```
 */
export const devLayer = Layer.effect(
  CliDev,
  Effect.gen(function* () {
    const compiler = yield* CliCompiler;
    const files = yield* CliFileSystem;
    const modules = yield* CliModules;
    const cleanup = yield* CliCleanup;
    const project = yield* CliProject;
    const supervisor = yield* CliDevSupervisor;
    const sourceWatch = yield* CliSourceWatch;
    const ports = yield* CliPortProbe;
    const telemetry = yield* CliTelemetryNative;
    return CliDev.of({
      run: (args, context) =>
        devCommandOperationEffect(args, context).pipe(
          Effect.provideService(CliCompiler, compiler),
          Effect.provideService(CliFileSystem, files),
          Effect.provideService(CliModules, modules),
          Effect.provideService(CliCleanup, cleanup),
          Effect.provideService(CliProject, project),
          Effect.provideService(CliDevSupervisor, supervisor),
          Effect.provideService(CliSourceWatch, sourceWatch),
          Effect.provideService(CliPortProbe, ports),
          Effect.provideService(CliTelemetryNative, telemetry),
        ),
    });
  }),
);

/** Composes the selected development graph with session-local import ownership.
 * @returns One selected dev dependency graph, including only session-local import caches.
 */
export function devLiveLayer() {
  return devLayer.pipe(
    Layer.provide(
      Layer.mergeAll(localCapabilitiesLayer, devSessionCapabilitiesLayer, telemetryNativeLayer),
    ),
  );
}
