/**
 * Rewrites checked manifest bindings for HTTP-only functions into generation-local
 * single-flight dynamic imports. The graph remains the complete validated route
 * table; only executable materialization is deferred.
 */
import type { ApplicationGraph } from "@relkit/graph";
import {
  identityStatements,
  identifierPattern,
  importBindings,
  insertMap,
  mapEntry,
  occurrences,
  projectPath,
  referencesIdentifier,
  removedDescriptorAliases,
  updateMap,
  type ManifestBinding,
} from "./build-prepared-manifest-source.js";

interface DeferredBinding extends ManifestBinding {
  readonly id: string;
}

/** Produces a prepared-only manifest while preserving unsupported bindings eagerly. */
export function preparedRuntimeManifest(
  source: string,
  graph: ApplicationGraph,
  projectRoot: string,
  sourceDirectory: string,
): string {
  const imports = importBindings(source);
  const routes = httpRoutes(graph);
  const deferred = deferredFunctionIds(graph, routes);
  const bindings: DeferredBinding[] = [...deferred].flatMap((id) => {
    const expression = mapEntry(source, "functions", id);
    const match = /^([\w$]+)(\[[^\]]+\])\.handler$/u.exec(expression ?? "");
    const imported = match === null ? undefined : imports.get(match[1]!);
    const node = graph.nodes.find(
      (candidate) => candidate.kind === "function" && candidate.id === id,
    );
    if (
      match === null ||
      imported === undefined ||
      node?.source === undefined ||
      projectPath(imported.specifier, projectRoot, sourceDirectory) !== node.source.file
    )
      return [];
    return [{ alias: imported.alias, specifier: imported.specifier, accessor: match[2]!, id }];
  });
  if (bindings.length === 0) return source;

  const loaderByAlias = new Map<string, string>();
  for (const [index, binding] of [
    ...new Map(bindings.map((entry) => [entry.alias, entry])).values(),
  ]
    .sort((left, right) => left.specifier.localeCompare(right.specifier))
    .entries()) {
    loaderByAlias.set(binding.alias, `__relkit_deferred_${index}`);
  }
  let output = source;
  for (const binding of bindings) {
    const loader = loaderByAlias.get(binding.alias)!;
    output = updateMap(
      output,
      "functions",
      binding.id,
      `${loader}().then((module) => module${binding.accessor}.handler(...args))`,
      true,
    );
    output = updateMap(output, "targets", binding.id);
  }
  output = insertMap(
    output,
    "targetLoaders",
    bindings.map((binding) => ({
      id: binding.id,
      expression: `() => ${loaderByAlias.get(binding.alias)!}().then((module) => module${binding.accessor})`,
    })),
    "targets",
  );
  for (const route of routes)
    if (bindings.some((binding) => binding.id === route.targetFunctionId))
      output = updateMap(output, "routes", route.id);
  for (const service of removableServices(graph, new Set(bindings.map((binding) => binding.id))))
    output = updateMap(output, "services", service);

  const aliases = new Set([
    ...bindings.map((binding) => binding.alias),
    ...removedDescriptorAliases(source, output, imports),
  ]);
  output = output
    .split("\n")
    .filter(
      (line) =>
        ![...aliases].some(
          (alias) =>
            line.includes("__relkit_bindDescriptorIdentity(") && referencesIdentifier(line, alias),
        ),
    )
    .join("\n");
  const removable = [...aliases].filter((alias) => occurrences(output, alias) === 1);
  if (bindings.some((binding) => !removable.includes(binding.alias))) return source;
  output = output
    .split("\n")
    .filter((line) => !removable.some((alias) => line.startsWith(`import * as ${alias} `)))
    .join("\n");

  const declarations = [...loaderByAlias]
    .filter(([alias]) => removable.includes(alias))
    .map(([alias, loader]) => {
      const specifier = imports.get(alias)!.specifier;
      const encodedSpecifier = codeStringLiteral(specifier);
      const identity = identityStatements(source, alias).map((line) =>
        line.replace(identifierPattern(alias, "gu"), "module"),
      );
      return `let ${loader}Promise: Promise<typeof import(${encodedSpecifier})> | undefined;\nconst ${loader} = () => (${loader}Promise ??= import(${encodedSpecifier}).then((module) => { ${identity.join(" ")} return module; }));`;
    });
  if (declarations.length === 0) return source;
  const insertion = output.indexOf("\n\n");
  return `${output.slice(0, insertion)}\n${declarations.join("\n")}\n${output.slice(insertion)}`;
}

function httpRoutes(graph: ApplicationGraph) {
  return graph.nodes.flatMap((node) =>
    node.kind === "trigger" &&
    node.triggerType === "http" &&
    typeof node.targetFunctionId === "string" &&
    !(isRecord(node.config) && node.config.rawHandler === true)
      ? [{ id: node.id, targetFunctionId: node.targetFunctionId }]
      : [],
  );
}

function deferredFunctionIds(graph: ApplicationGraph, routes: ReturnType<typeof httpRoutes>) {
  const candidates = new Set(routes.map((route) => route.targetFunctionId));
  for (const node of graph.nodes) {
    if (node.kind === "service" && node.capability !== undefined)
      for (const member of node.functions) candidates.delete(member.functionId);
    if (
      "targetFunctionId" in node &&
      typeof node.targetFunctionId === "string" &&
      !(node.kind === "trigger" && node.triggerType === "http")
    )
      candidates.delete(node.targetFunctionId);
  }
  for (const edge of graph.edges) if (edge.kind === "publishes-event") candidates.delete(edge.from);
  return candidates;
}

function removableServices(
  graph: ApplicationGraph,
  deferred: ReadonlySet<string>,
): readonly string[] {
  return graph.nodes.flatMap((node) =>
    node.kind === "service" &&
    node.capability === undefined &&
    node.functions.length > 0 &&
    node.functions.every((member) => deferred.has(member.functionId)) &&
    node.events.length === 0 &&
    (node.tasks?.length ?? 0) === 0 &&
    (node.jobs?.length ?? 0) === 0
      ? [node.id]
      : [],
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Encodes a JavaScript string literal without leaving HTML script delimiters intact. */
function codeStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("/", "\\u002F")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
