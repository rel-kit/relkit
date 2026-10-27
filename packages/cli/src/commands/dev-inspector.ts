/**
 * Reads the application's backend port through explicit compiler authority.
 * Inspection starts only when enabled in authored configuration; its bind policy
 * is unrelated to the independently launched standalone UI.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Layer } from "effect";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";
import { CliModules, moduleLayer } from "../services/modules.service.js";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import type { DevelopmentPorts } from "./dev-inspector.types.js";
import { resolveApplicationPort } from "./ports.js";

/**
 * Reads authored configuration through explicit import/compiler authority.
 * @param projectRoot - Authored project root.
 * @param backendPort - Optional command override.
 * @param inspectorPort - Retired flag, rejected with standalone-tool guidance.
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
    return yield* cliTry("dev.ports.resolve", (): DevelopmentPorts => {
      if (inspectorPort !== undefined)
        throw new TypeError(
          "--inspector-port moved to the standalone inspector; run relkit inspector --port, and configure inspector.connection.port for the bridge.",
        );
      return {
        backend: resolveApplicationPort({
          ...(backendPort === undefined ? {} : { flag: backendPort }),
          source,
          configured: config.server.port,
        }),
        inspector: config.inspector.enabled ? config.inspector.connection : false,
      };
    });
  },
  (
    effect,
    _root: string,
    _backend?: number,
    _inspector?: number,
    _source: Readonly<Record<string, string | undefined>> = process.env,
  ) => observeCli("dev.ports", effect),
);

/** Resolves the explicitly selected application bridge without looking up UI assets.
 * @param projectRoot - Authored root.
 * @param inspectorPort - Optional override.
 * @param source - Environment.
 * @returns Public inspector policy.
 */
export async function configuredInspectorOptions(
  projectRoot: string,
  inspectorPort?: number,
  source: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DevelopmentPorts["inspector"]> {
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
