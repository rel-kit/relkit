/** Projects every bounded acyclic route over complete installed physical edges.
 * Physical bytes are collected separately once; later incoming parents and actual
 * package identities remain visible even through native installation aliases.
 */
import { CONSUMER_PATH_LIMITS } from "./consumer-path-limits.js";
import type { ConsumerInstallation } from "./consumer-installation.types.js";
import type { DependencyPath } from "./consumer-dependency-policy.types.js";

/**
 * Builds finite adjacency from measured physical edges.
 * @param edges - Canonical installed source/target directories.
 * @returns Deduplicated physical destinations per importer.
 * @throws Error When the physical edge inventory exceeds the collector budget.
 */
function installedGraph(edges: ConsumerInstallation["edges"]) {
  if (edges.length > CONSUMER_PATH_LIMITS.edges)
    throw new Error("Installation graph edge budget exceeded");
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    const targets = graph.get(edge.from) ?? new Set<string>();
    targets.add(edge.to);
    graph.set(edge.from, targets);
  }
  return graph;
}

/** Separates installing ownership from optional peers already supplied by another owner.
 * @param root - Consuming project whose ordinary closure supplies peers.
 * @param edges - Complete resolved edges, retained unchanged in the raw inventory.
 * @returns Installing adjacency; optional peers without another owner stay visible.
 */
function installationOwnershipGraph(root: string, edges: ConsumerInstallation["edges"]) {
  const graph = installedGraph(edges);
  const required = installedGraph(edges.filter((edge) => !edge.optionalPeer));
  const owned = new Set([root]),
    pending = [root];
  for (const from of pending) {
    for (const to of required.get(from) ?? []) {
      if (owned.has(to)) continue;
      owned.add(to);
      pending.push(to);
    }
  }
  for (const edge of edges) {
    if (edge.optionalPeer && owned.has(edge.to) && !required.get(edge.from)?.has(edge.to))
      graph.get(edge.from)?.delete(edge.to);
  }
  return graph;
}

/**
 * Preserves installing physical routes without remeasuring shared packages.
 * Borrowed optional peers remain raw resolution edges rather than additional installers.
 * @param root - Canonical consuming project root.
 * @param consumerName - Actual root manifest identity.
 * @param edges - Fully collected physical dependency edges.
 * @param instances - Unique measured identities, independent of declared aliases.
 * @returns Exact package-name routes; cycles retain a closing edge without recursion.
 * @throws Error When ownership or finite file/path/depth budgets fail.
 */
export function projectInstallationPaths(
  root: string,
  consumerName: string,
  edges: ConsumerInstallation["edges"],
  instances: ConsumerInstallation["instances"],
): readonly DependencyPath[] {
  if (instances.length > CONSUMER_PATH_LIMITS.files)
    throw new Error("Installation graph file budget exceeded");
  const names = new Map([
    [root, consumerName],
    ...instances.map((item) => [item.physicalPath, item.name] as const),
  ]);
  const graph = installationOwnershipGraph(root, edges);
  const pending = [{ directory: root, ancestors: [root], packages: [consumerName] }];
  const paths: DependencyPath[] = [];
  for (const visit of pending) {
    for (const target of graph.get(visit.directory) ?? []) {
      const name = names.get(target);
      if (name === undefined) throw new Error("Installed edge has no measured package identity");
      const packages = [...visit.packages, name];
      if (packages.length > CONSUMER_PATH_LIMITS.depth)
        throw new Error("Installation graph depth budget exceeded");
      if (paths.length >= CONSUMER_PATH_LIMITS.paths)
        throw new Error("Installation graph path budget exceeded");
      paths.push({ boundary: "installation", packages });
      if (visit.ancestors.includes(target)) continue;
      pending.push({ directory: target, ancestors: [...visit.ancestors, target], packages });
    }
  }
  return paths;
}
