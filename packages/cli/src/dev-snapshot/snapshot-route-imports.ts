/**
 * Projects Bun's data-only split-bundle metafile into the executable closure for
 * every HTTP route. Output paths are normalized relative to the build server
 * directory and never evaluated or imported while preparing the receipt.
 */
import { isAbsolute, posix, relative } from "node:path";
import type { ApplicationGraph } from "@relkit/graph";
import { Schema } from "effect";
import { SnapshotPath } from "./snapshot.schemas.js";

interface BundleImport {
  readonly path: string;
  readonly external?: boolean;
}

interface BundleOutput {
  readonly entryPoint?: string;
  readonly imports: readonly BundleImport[];
}

interface HttpRoute {
  readonly id: string;
  readonly targetFunctionId: string;
}

/** Returns complete deterministic route-to-bundle-member closures. */
export function snapshotRouteImports(
  metadata: unknown,
  graph: ApplicationGraph,
  routes: readonly HttpRoute[],
  projectRoot: string,
): ReadonlyArray<{ readonly routeId: string; readonly members: readonly string[] }> {
  const outputs = bundleOutputs(metadata);
  const entryBySource = new Map<string, string>();
  for (const [path, output] of outputs) {
    if (output.entryPoint !== undefined)
      entryBySource.set(projectPath(output.entryPoint, projectRoot), path);
  }
  return routes.map((route) => {
    const target = graph.nodes.find(
      (node) => node.kind === "function" && node.id === route.targetFunctionId,
    );
    const root =
      target?.source === undefined
        ? "index.js"
        : (entryBySource.get(target.source.file) ?? "index.js");
    return { routeId: route.id, members: outputClosure(outputs, root) };
  });
}

function bundleOutputs(metadata: unknown): ReadonlyMap<string, BundleOutput> {
  if (!isRecord(metadata) || !isRecord(metadata.outputs)) throw new TypeError("Invalid outputs");
  const outputs = new Map<string, BundleOutput>();
  for (const [nativePath, value] of Object.entries(metadata.outputs)) {
    const path = outputPath(nativePath);
    if (!isRecord(value) || !Array.isArray(value.imports)) throw new TypeError("Invalid output");
    const imports = value.imports.map((entry) => {
      if (!isRecord(entry) || typeof entry.path !== "string") throw new TypeError("Invalid import");
      return { path: entry.path, ...(entry.external === true ? { external: true } : {}) };
    });
    if (value.entryPoint !== undefined && typeof value.entryPoint !== "string")
      throw new TypeError("Invalid entry point");
    outputs.set(path, {
      imports,
      ...(typeof value.entryPoint === "string" ? { entryPoint: value.entryPoint } : {}),
    });
  }
  if (!outputs.has("index.js")) throw new TypeError("Missing server entry point");
  return outputs;
}

function outputClosure(
  outputs: ReadonlyMap<string, BundleOutput>,
  root: string,
): readonly string[] {
  const pending = [root];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    const output = outputs.get(path);
    if (output === undefined) throw new TypeError(`Missing bundle output: ${path}`);
    visited.add(path);
    for (const imported of output.imports) {
      if (imported.external === true || !imported.path.startsWith(".")) continue;
      pending.push(outputPath(posix.join(posix.dirname(path), imported.path)));
    }
  }
  return [...visited].map((path) => `server/${path}`).sort();
}

function projectPath(path: string, root: string): string {
  return (isAbsolute(path) ? relative(root, path) : path)
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "");
}

function outputPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!Schema.is(SnapshotPath)(normalized) || normalized.startsWith("../"))
    throw new TypeError(`Unsafe bundle output: ${path}`);
  return normalized;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
