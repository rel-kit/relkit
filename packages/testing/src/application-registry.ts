/** Loads fresh generated modules with their original native import ancestry and guarded SDK resolution. */
import type { TestApplicationArtifacts } from "./application-registry.types.js";
export type { TestApplicationArtifacts } from "./application-registry.types.js";
import { dirname, join } from "node:path";
import { isBuiltin } from "node:module";
import { pathToFileURL } from "node:url";
import {
  createFunctionRegistry,
  type FunctionRegistryOptions,
  type LoadedRuntimeIntegrationModule,
} from "@relkit/engine";

/**
 * Loads the generated graph, handlers, and selected integration modules for one test generation.
 * @param root - Explicit source project or persistence root.
 * @returns Native artifacts, or undefined when generated output is absent.
 */
export async function loadTestApplicationArtifacts(
  root: string,
): Promise<TestApplicationArtifacts | undefined> {
  const directory = join(root, ".relkit", "generated");
  const manifestPath = join(directory, "runtime.manifest.ts");
  if (!(await Bun.file(manifestPath).exists())) return undefined;
  const graph = (await Bun.file(
    join(directory, "application.graph.json"),
  ).json()) as FunctionRegistryOptions["graph"];
  const clientContract = (await Bun.file(join(directory, "client-contract.json")).json()) as {
    readonly publicFingerprint?: unknown;
  };
  const manifest = await importGenerated(manifestPath);
  const integrationsPath = join(directory, "runtime-integrations.ts");
  const integrations = (await Bun.file(integrationsPath).exists())
    ? await importGenerated(integrationsPath)
    : undefined;
  const runtimeIntegrationModules = integrations?.runtimeIntegrationModules;
  if (runtimeIntegrationModules !== undefined && !Array.isArray(runtimeIntegrationModules))
    throw new TypeError("Generated runtime integration modules are invalid.");
  return {
    graph,
    publicFingerprint:
      typeof clientContract.publicFingerprint === "string"
        ? clientContract.publicFingerprint
        : "test",
    registry: createFunctionRegistry({
      graph,
      manifest: manifest.runtimeManifest as FunctionRegistryOptions["manifest"],
      projectRoot: root,
    }),
    runtimeIntegrationModules:
      (runtimeIntegrationModules as readonly LoadedRuntimeIntegrationModule[] | undefined) ?? [],
  };
}

/**
 * Imports fresh generated source while retaining native ancestry and late dynamic resolution.
 * @param path - Native module path or route path being resolved.
 * @returns The module exports, preserving original evaluation and resolution failures.
 */
async function importGenerated(path: string): Promise<Record<string, unknown>> {
  const transformed = new Bun.Transpiler({
    loader: "ts",
    define: { "import.meta.url": JSON.stringify(pathToFileURL(path).href) },
  }).transformSync(await Bun.file(path).text());
  const source = transformed.replace(/from ("(?:[^"\\]|\\.)*")/g, (_match, literal: string) => {
    const specifier = JSON.parse(literal) as string;
    if (isBuiltin(specifier)) return `from ${literal}`;
    const url = specifier.startsWith(".")
      ? new URL(specifier, pathToFileURL(path)).href
      : pathToFileURL(Bun.resolveSync(specifier, dirname(path))).href;
    return `from ${JSON.stringify(url)}`;
  });
  const code = source.replace(/\bimport\(("(?:[^"\\]|\\.)*")\)/g, (match, literal: string) => {
    const specifier = JSON.parse(literal) as string;
    if (isBuiltin(specifier)) return match;
    return specifier.startsWith(".")
      ? `import(${JSON.stringify(new URL(specifier, pathToFileURL(path)).href)})`
      : `import(Bun.resolveSync(${literal}, ${JSON.stringify(dirname(path))}))`;
  });
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    return (await import(url)) as Record<string, unknown>;
  } finally {
    URL.revokeObjectURL(url);
  }
}
