/**
 * Resolves the installed inspector without importing the compiler or app config.
 * Generated snapshot startup uses this native edge after validating its stored
 * port policy; source inspection requires the explicit contributor environment.
 */
import { existsSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { DevInspectorOptions } from "./dev-process.types.js";
import type { InspectorInstallation } from "./dev-inspector.types.js";

/**
 * Selects the installed or explicitly configured inspector's launch inputs.
 * @param inspectorPort - Accepted configured/command listener override.
 * @returns Pure process policy; no child or listener is acquired.
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
 * Exposes the current inspector directory at the synchronous compatibility edge.
 * @returns Installed directory or explicit validated contributor source root.
 */
export function inspectorRoot(): string {
  return resolveInspectorInstallation().root;
}

/**
 * Locates the installation without importing or starting the inspector.
 * @param baseDirectory - Actual executing CLI module directory.
 * @param source - Native command environment, with optional explicit contributor root.
 * @returns Packaged inspector process inputs or validated contributor source inputs.
 */
export function resolveInspectorInstallation(
  baseDirectory: string = fileURLToPath(new URL(".", import.meta.url)),
  source: Readonly<Record<string, string | undefined>> = process.env,
): InspectorInstallation {
  const configured = source.RELKIT_INSPECTOR_ROOT;
  if (configured !== undefined) return sourceInstallation(configured);
  for (const location of ["../inspector", "../../dist/inspector"]) {
    const packaged = resolve(baseDirectory, location);
    if (existsSync(join(packaged, "server.js")))
      return { root: packaged, command: ["node", "server.js"] };
  }
  throw new Error("The packaged RELKIT inspector is missing. Reinstall @relkit/cli.");
}

/**
 * Validates an explicit source installation at the native process-policy edge.
 * @param root - Contributor-selected checkout.
 * @returns Launch inputs after physical root/manifest containment verification.
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
