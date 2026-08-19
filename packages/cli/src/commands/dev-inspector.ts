import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "@zsys/compiler";
import type { DevInspectorOptions } from "./dev-process.js";

/** Returns the workspace Next inspector command used by the default dev flow. */
export function defaultInspectorOptions(inspectorPort?: number): DevInspectorOptions {
  const root = inspectorRoot();
  return {
    command: [process.execPath, "run", "dev"],
    cwd: root,
    ...(inspectorPort === undefined ? {} : { port: inspectorPort }),
  };
}

export async function configuredInspectorOptions(
  projectRoot: string,
  inspectorPort?: number,
): Promise<DevInspectorOptions> {
  if (inspectorPort !== undefined) return defaultInspectorOptions(inspectorPort);
  const configPath = join(projectRoot, "zsys.config.ts");
  const loaded = (await import(`${pathToFileURL(configPath).href}?zsys_dev=${Date.now()}`)) as {
    readonly default?: unknown;
  };
  return defaultInspectorOptions(loadConfig(loaded.default ?? loaded, projectRoot).inspector.port);
}

export function inspectorRoot(): string {
  const configured = process.env.ZSYS_INSPECTOR_ROOT;
  const candidates = [configured, resolve(import.meta.dir, "../../../../apps/inspector")].filter(
    (candidate): candidate is string => candidate !== undefined,
  );
  const root = candidates.find((candidate) => existsSync(join(candidate, "package.json")));
  if (root === undefined)
    throw new Error(
      "The Next inspector is unavailable. Set ZSYS_INSPECTOR_ROOT to an inspector app directory.",
    );
  return root;
}
