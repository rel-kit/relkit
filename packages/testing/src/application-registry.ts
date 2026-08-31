import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createFunctionRegistry,
  type FunctionRegistry,
  type FunctionRegistryOptions,
} from "@relkit/engine";

/** Reuses generated bindings for event contracts and nested function calls. */
export async function loadTestRegistry(root: string): Promise<FunctionRegistry | undefined> {
  const directory = join(root, ".relkit", "generated");
  const manifestPath = join(directory, "runtime.manifest.ts");
  if (!(await Bun.file(manifestPath).exists())) return undefined;
  const graph = (await Bun.file(
    join(directory, "application.graph.json"),
  ).json()) as FunctionRegistryOptions["graph"];
  const source = (await Bun.file(manifestPath).text()).replace(
    /from ("(?:[^"\\]|\\.)*")/g,
    (_match, literal: string) => {
      const specifier = JSON.parse(literal) as string;
      const url = specifier.startsWith(".")
        ? new URL(specifier, pathToFileURL(manifestPath)).href
        : pathToFileURL(Bun.resolveSync(specifier, import.meta.dir)).href;
      return `from ${JSON.stringify(url)}`;
    },
  );
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    const module = await import(url);
    return createFunctionRegistry({ graph, manifest: module.runtimeManifest, projectRoot: root });
  } finally {
    URL.revokeObjectURL(url);
  }
}
