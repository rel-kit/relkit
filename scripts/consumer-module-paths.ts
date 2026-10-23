/** Maps native module observations to bounded package routes without borrowing install edges. */
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { CONSUMER_PATH_LIMITS } from "./consumer-path-limits.js";
import { isForbiddenConsumerDependency } from "./consumer-dependency-policy.js";
import type { ConsumerInstallation } from "./consumer-installation.types.js";
import type {
  DependencyBoundary,
  DependencyPath,
  InstalledDependency,
} from "./consumer-dependency-policy.types.js";
import type { ConsumerModuleEdge } from "./consumer-module-paths.types.js";

/**
 * Rejects workspace escapes and modules absent from measured installed ownership.
 * @param file - Canonical observed file.
 * @param root - Canonical consumer root.
 * @param instances - Canonical measured packages, deepest root first.
 * @param consumerName - Identity for application-local source.
 * @returns Actual package name, without substituting a declared import alias.
 */
function moduleOwner(
  file: string,
  root: string,
  instances: readonly InstalledDependency[],
  consumerName: string,
): string {
  const child = relative(root, file);
  if (child === ".." || child.startsWith("../") || isAbsolute(child))
    throw new Error(`Consumer module escaped its installation: ${file}`);
  const owner = instances.find((entry) => file.startsWith(`${entry.physicalPath}/`));
  if (owner !== undefined) return owner.name;
  if (child.split("/").includes("node_modules"))
    throw new Error(`Observed module has no declared installation owner: ${file}`);
  return consumerName;
}

/**
 * Canonicalizes each physical package and observed file once before ownership lookup.
 * @param files - Native observed paths, absolute or relative to consumer root.
 * @param root - Canonical external consumer root.
 * @param installation - Independent physical package records.
 * @param consumerName - Actual consumer identity.
 * @returns Canonical file owners; aliases project to their real installed identity.
 */
function moduleOwners(
  files: readonly string[],
  root: string,
  installation: ConsumerInstallation,
  consumerName: string,
) {
  const instances = installation.instances
    .map((entry) => ({
      ...entry,
      physicalPath: realpathSync(entry.physicalPath),
    }))
    .sort((left, right) => right.physicalPath.length - left.physicalPath.length);
  return new Map(
    files.map((file) => {
      const canonical = realpathSync(resolve(root, file));
      return [canonical, moduleOwner(canonical, root, instances, consumerName)] as const;
    }),
  );
}

/**
 * Joins native edges only after both endpoints use the same canonical identity.
 * @param edges - Resolved native file pairs.
 * @param owners - Actual observed canonical file owners.
 * @param root - External consumer root for relative native inputs.
 * @returns Finite adjacency; edges to unobserved modules never become observations.
 */
function moduleEdges(
  edges: readonly ConsumerModuleEdge[],
  owners: ReadonlyMap<string, string>,
  root: string,
) {
  if (edges.length > CONSUMER_PATH_LIMITS.edges)
    throw new Error("Module graph edge budget exceeded");
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    const from = realpathSync(resolve(root, edge.from)),
      to = realpathSync(resolve(root, edge.to));
    if (!owners.has(from) || !owners.has(to)) continue;
    const targets = graph.get(from) ?? new Set<string>();
    targets.add(to);
    graph.set(from, targets);
  }
  return graph;
}

/**
 * Retains distinct package routes while rejecting exponential or overly deep evidence.
 * @param first - Required observed canonical entry.
 * @param owners - Canonical native observations.
 * @param graph - Canonical edges independent of manifest dependency declarations.
 * @param root - Canonical consumer root.
 * @param boundary - Measurement label retained on every route.
 * @param consumerName - Application identity at the root of each path.
 * @returns All bounded routes and observations unreachable from the actual entry.
 */
function moduleRoutes(
  first: string,
  owners: ReadonlyMap<string, string>,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  root: string,
  boundary: DependencyBoundary,
  consumerName: string,
) {
  const entryOwner = owners.get(first);
  if (entryOwner === undefined) throw new Error("Observed entry is missing from module evidence");
  const initial = entryOwner === consumerName ? [consumerName] : [consumerName, entryOwner];
  const allRoutes = [...owners.values()].some(isForbiddenConsumerDependency);
  const seen = new Set([first]),
    visits = new Set([JSON.stringify([first, initial])]);
  const pending = [{ file: first, packages: initial, ancestors: [first] }];
  const paths: DependencyPath[] = [
    { boundary, packages: initial, artifact: relative(root, first) },
  ];
  for (const visit of pending) {
    for (const target of graph.get(visit.file) ?? []) {
      const owner = owners.get(target);
      if (owner === undefined) throw new Error("Observed edge has no module owner");
      const packages =
        visit.packages.at(-1) === owner ? visit.packages : [...visit.packages, owner];
      if (packages.length > CONSUMER_PATH_LIMITS.depth)
        throw new Error("Module graph depth budget exceeded");
      seen.add(target);
      // SDK-free ownership needs one witness per file; governed SDKs retain every route.
      const key = JSON.stringify([target, allRoutes ? packages : []]);
      if (visits.has(key)) continue;
      if (paths.length >= CONSUMER_PATH_LIMITS.paths)
        throw new Error("Module graph path budget exceeded");
      visits.add(key);
      paths.push({ boundary, packages, artifact: relative(root, target) });
      if (visit.ancestors.includes(target)) continue;
      pending.push({ file: target, packages, ancestors: [...visit.ancestors, target] });
    }
  }
  return { paths, unreached: [...owners.keys()].filter((file) => !seen.has(file)) };
}

/**
 * Maps actual native files through their observed edges, failing closed on missing or oversized evidence.
 * @param entry - Actual executable or declaration entry.
 * @param files - Files observed by the native compiler, runtime or bundler.
 * @param edges - Independently observed or explicitly reconstructed file resolutions.
 * @param root - External consumer installation root.
 * @param installation - Physical package ownership used only to name observed files.
 * @param boundary - Independent measurement label.
 * @param consumerName - Actual application identity.
 * @returns Bounded exact package routes and files not reachable from the required entry.
 * @throws Error If entry observation, containment, ownership or finite budgets fail.
 */
export function consumerModulePaths(
  entry: string,
  files: readonly string[],
  edges: readonly ConsumerModuleEdge[],
  root: string,
  installation: ConsumerInstallation,
  boundary: DependencyBoundary,
  consumerName: string,
) {
  if (files.length === 0) throw new Error("Observed entry is missing from module evidence");
  if (files.length > CONSUMER_PATH_LIMITS.files)
    throw new Error("Module graph file budget exceeded");
  root = realpathSync(root);
  const owners = moduleOwners(files, root, installation, consumerName);
  return moduleRoutes(
    realpathSync(resolve(root, entry)),
    owners,
    moduleEdges(edges, owners, root),
    root,
    boundary,
    consumerName,
  );
}
