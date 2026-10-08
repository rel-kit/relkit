import { existsSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Effect, Layer } from "effect";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";
import { CliModules, moduleLayer } from "../services/modules.service.js";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import type { DevInspectorOptions } from "./dev-process.types.js";
import type { DevelopmentPorts, InspectorInstallation } from "./dev-inspector.types.js";
import { resolveApplicationPort, resolveInspectorPort } from "./ports.js";

/** Selects the source or packaged inspector's default launch configuration.
 * @param inspectorPort - Optional accepted listener override.
 * @returns Source or installed inspector launch policy.
 */
export function defaultInspectorOptions(inspectorPort?: number): DevInspectorOptions {
  const installation = resolveInspectorInstallation();
  return {
    command: installation.command,
    cwd: installation.root,
    ...(inspectorPort === undefined ? {} : { port: inspectorPort }),
  };
}

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
/** Locates the source or packaged inspector through the synchronous installation edge.
 * @returns Selected inspector installation root using the synchronous native installation edge.
 */
export function inspectorRoot(): string {
  return resolveInspectorInstallation().root;
}
/**
 * Locates the installation without importing or starting the inspector.
 * @param baseDirectory - CLI module directory.
 * @param source - Explicit native environment.
 * @returns Source checkout or packed inspector process inputs.
 */
export function resolveInspectorInstallation(
  baseDirectory: string = fileURLToPath(new URL(".", import.meta.url)),
  source: Readonly<Record<string, string | undefined>> = process.env,
): InspectorInstallation {
  const configured = source.RELKIT_INSPECTOR_ROOT;
  if (configured !== undefined) return sourceInstallation(configured);
  const workspace = resolve(baseDirectory, "../../../../apps/inspector");
  if (existsSync(join(workspace, "package.json"))) return sourceInstallation(workspace);
  const packaged = resolve(baseDirectory, "../inspector");
  if (existsSync(join(packaged, "server.js")))
    return { root: packaged, command: ["node", "server.js"] };
  throw new Error("The packaged RELKIT inspector is missing. Reinstall @relkit/cli.");
}
/** Validates an explicit source inspector installation and prepares its launch inputs.
 * @param root - Explicit checkout.
 * @returns Native development process inputs after installation validation.
 */
function sourceInstallation(root: string): InspectorInstallation {
  let directory: string;
  let manifest: string;
  try {
    directory = realpathSync(resolve(root));
    manifest = realpathSync(join(directory, "package.json"));
  } catch {
    throw new Error(`RELKIT_INSPECTOR_ROOT does not contain an inspector app: ${root}`);
  }
  if (!manifest.startsWith(join(directory, sep)))
    throw new Error("RELKIT_INSPECTOR_ROOT package.json must stay inside the inspector directory.");
  return { root: directory, command: [process.execPath, "run", "dev"] };
}
