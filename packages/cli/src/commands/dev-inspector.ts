import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "@zsys/compiler";
import type { DevInspectorOptions } from "./dev-process.js";
import { resolveApplicationPort, resolveInspectorPort } from "./ports.js";

/** Returns the workspace Next inspector command used by the default dev flow. */
export function defaultInspectorOptions(inspectorPort?: number): DevInspectorOptions {
  const installation = inspectorInstallation();
  return {
    command: installation.command,
    cwd: installation.root,
    ...(inspectorPort === undefined ? {} : { port: inspectorPort }),
  };
}

export async function configuredInspectorOptions(
  projectRoot: string,
  inspectorPort?: number,
  source: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DevInspectorOptions> {
  const configured = await developmentPorts(projectRoot, undefined, inspectorPort, source);
  return configured.inspector;
}

export async function developmentPorts(
  projectRoot: string,
  backendPort?: number,
  inspectorPort?: number,
  source: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{ readonly backend: number; readonly inspector: DevInspectorOptions }> {
  const configPath = join(projectRoot, "zsys.config.ts");
  const loaded = (await import(`${pathToFileURL(configPath).href}?zsys_dev=${Date.now()}`)) as {
    readonly default?: unknown;
  };
  const config = loadConfig(loaded.default ?? loaded, projectRoot);
  return {
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
  };
}

export function inspectorRoot(): string {
  return inspectorInstallation().root;
}

function inspectorInstallation(): { readonly root: string; readonly command: readonly string[] } {
  const configured = process.env.ZSYS_INSPECTOR_ROOT;
  if (configured !== undefined) return sourceInstallation(configured);
  const packaged = resolve(import.meta.dir, "../inspector");
  if (existsSync(join(packaged, "server.js")))
    return { root: packaged, command: ["node", "server.js"] };
  const workspace = resolve(import.meta.dir, "../../../../apps/inspector");
  if (existsSync(join(workspace, "package.json"))) return sourceInstallation(workspace);
  throw new Error("The packaged ZSYS inspector is missing. Reinstall @zsys/cli.");
}

function sourceInstallation(root: string): {
  readonly root: string;
  readonly command: readonly string[];
} {
  if (!existsSync(join(root, "package.json")))
    throw new Error(`ZSYS_INSPECTOR_ROOT does not contain an inspector app: ${root}`);
  return { root, command: [process.execPath, "run", "dev"] };
}
