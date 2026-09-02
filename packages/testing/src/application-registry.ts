import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createFunctionRegistry,
  type FunctionRegistry,
  type FunctionRegistryOptions,
  type LoadedRuntimeIntegrationModule,
} from "@relkit/engine";

export interface TestApplicationArtifacts {
  readonly graph: FunctionRegistryOptions["graph"];
  readonly registry: FunctionRegistry;
  readonly runtimeIntegrationModules: readonly LoadedRuntimeIntegrationModule[];
}

/** Loads the generated graph, handlers, and selected integration modules for one test generation. */
export async function loadTestApplicationArtifacts(
  root: string,
): Promise<TestApplicationArtifacts | undefined> {
  const directory = join(root, ".relkit", "generated");
  const manifestPath = join(directory, "runtime.manifest.ts");
  if (!(await Bun.file(manifestPath).exists())) return undefined;
  const graph = (await Bun.file(
    join(directory, "application.graph.json"),
  ).json()) as FunctionRegistryOptions["graph"];
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
    registry: createFunctionRegistry({
      graph,
      manifest: manifest.runtimeManifest as FunctionRegistryOptions["manifest"],
      projectRoot: root,
    }),
    runtimeIntegrationModules:
      (runtimeIntegrationModules as readonly LoadedRuntimeIntegrationModule[] | undefined) ?? [],
  };
}

async function importGenerated(path: string): Promise<Record<string, unknown>> {
  const source = (await Bun.file(path).text()).replace(
    /from ("(?:[^"\\]|\\.)*")/g,
    (_match, literal: string) => {
      const specifier = JSON.parse(literal) as string;
      const url = specifier.startsWith(".")
        ? new URL(specifier, pathToFileURL(path)).href
        : pathToFileURL(Bun.resolveSync(specifier, dirname(path))).href;
      return `from ${JSON.stringify(url)}`;
    },
  );
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    return (await import(url)) as Record<string, unknown>;
  } finally {
    URL.revokeObjectURL(url);
  }
}
