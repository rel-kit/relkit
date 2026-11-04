/** Import rules between `relkit` source areas and the integrations that build on them. */

/** Areas that define the contracts integrations implement or call. */
const protocolAreas: ReadonlySet<string> = new Set([
  "agent-adapters",
  "agents",
  "buckets",
  "cache",
  "config",
  "contracts",
  "deploy",
  "jobs",
  "local-service",
  "observability",
  "provider",
  "realtime",
]);

/** Further areas a named integration may use because it implements them. */
const integrationAreas: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["@relkit/local", new Set(["providers-local"])],
  ["@relkit/redis", new Set(["providers-local"])],
  ["@relkit/langchain", new Set(["functions", "invocation", "schema", "tools"])],
  // The AWS deployment components run the engine against the application graph.
  ["@relkit/aws", new Set(["engine", "events", "graph"])],
]);

/**
 * Finds the area rule an import breaks, if any.
 * @param owner - Importing package name or `relkit/<area>`.
 * @param ownerPath - Repository-relative path of the importing package.
 * @param file - Repository-relative importing file.
 * @param dependency - Imported package or `relkit/<area>`.
 * @returns The rule name and message, or undefined when the import is allowed.
 */
export function areaViolation(
  owner: string,
  ownerPath: string,
  file: string,
  dependency: string,
): { rule: string; message: string } | undefined {
  if (!file.includes("/src/")) return undefined;
  if (owner === "relkit/engine" && dependency === "relkit/providers-local")
    return {
      rule: "engine-local-provider-import",
      message: "relkit/engine imports local provider implementations from relkit/providers-local",
    };
  if (!ownerPath.startsWith("integrations/packages/") || !dependency.startsWith("relkit/"))
    return undefined;
  const area = dependency.slice("relkit/".length);
  if (protocolAreas.has(area) || integrationAreas.get(owner)?.has(area)) return undefined;
  return {
    rule: "integration-non-protocol-import",
    message: `${owner} imports non-protocol area "${dependency}"`,
  };
}
