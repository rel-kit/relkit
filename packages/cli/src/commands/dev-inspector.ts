/**
 * Reads validated authored port configuration through explicit compiler authority.
 * Prepared startup imports the separate installation leaf, avoiding evaluation;
 * these established APIs retain full configuration checks for the safe path.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Layer } from "effect";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";
import { CliModules, moduleLayer } from "../services/modules.service.js";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import type { DevInspectorOptions } from "./dev-process.types.js";
import type { DevelopmentPorts } from "./dev-inspector.types.js";
import { resolveApplicationPort, resolveInspectorPort } from "./ports.js";
import { defaultInspectorOptions } from "./dev-inspector-installation.js";
export {
  defaultInspectorOptions,
  inspectorRoot,
  resolveInspectorInstallation,
} from "./dev-inspector-installation.js";

/**
 * Reads authored configuration through explicit import/compiler authority.
 * @param projectRoot - Authored project root.
 * @param backendPort - Optional command override.
 * @param inspectorPort - Optional command override.
 * @param source - Captured invocation environment.
 * @returns Validated ports and inspector launch policy.
 */
export const developmentPortsEffect = Effect.fn("Dev.ports")(
  function* (
    projectRoot: string,
    backendPort?: number,
    inspectorPort?: number,
    source: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    const compiler = yield* CliCompiler;
    const modules = yield* CliModules;
    const loaded = yield* modules.load(
      `${pathToFileURL(join(projectRoot, "relkit.config.ts")).href}?relkit_dev=${crypto.randomUUID()}`,
    );
    const config = yield* compiler.loadConfig(loaded.default ?? loaded, projectRoot);
    return yield* cliTry("dev.ports.resolve", (): DevelopmentPorts => ({
      backend: resolveApplicationPort({
        ...(backendPort === undefined ? {} : { flag: backendPort }),
        source,
        configured: config.server.port,
      }),
      inspector: defaultInspectorOptions(
        resolveInspectorPort({
          ...(inspectorPort === undefined ? {} : { flag: inspectorPort }),
          source,
          configured: config.inspector.port,
        }),
      ),
    }));
  },
  (
    effect,
    _root: string,
    _backend?: number,
    _inspector?: number,
    _source: Readonly<Record<string, string | undefined>> = process.env,
  ) => observeCli("dev.ports", effect),
);

/** Restores the validated inspector configuration at the public Promise boundary.
 * @param projectRoot - Authored root.
 * @param inspectorPort - Optional override.
 * @param source - Environment.
 * @returns Public inspector policy.
 */
export async function configuredInspectorOptions(
  projectRoot: string,
  inspectorPort?: number,
  source: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DevInspectorOptions> {
  return (await developmentPorts(projectRoot, undefined, inspectorPort, source)).inspector;
}
/** Restores validated backend and inspector ports at the public Promise boundary.
 * @param projectRoot - Authored root.
 * @param backendPort - Optional override.
 * @param inspectorPort - Optional override.
 * @param source - Environment.
 * @returns Public validated listener policy.
 */
export function developmentPorts(
  projectRoot: string,
  backendPort?: number,
  inspectorPort?: number,
  source: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DevelopmentPorts> {
  return runCliEffect(
    developmentPortsEffect(projectRoot, backendPort, inspectorPort, source),
    Layer.merge(compilerLayer, moduleLayer),
  );
}
