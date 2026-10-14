/**
 * Chooses new scaffold boundaries from compiler-backed layout discovery while
 * preserving existing physical service paths. Older manually supplied planning
 * records use the same pure contracts rather than a second folder-depth rule.
 */
import { selectApplicationLayout } from "@relkit/contracts";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";

/**
 * Locates an existing service or constructs a new boundary in the selected layout.
 * @param discovery - Declaration-only project facts produced by compiler discovery.
 * @param name - Validated kebab-case service directory name.
 * @returns Actual existing boundary or a grouped/flat destination for a new service.
 * @throws AddScaffoldError for a mixed or otherwise structurally invalid layout.
 */
export function scaffoldServiceBoundary(discovery: ProjectDiscovery, name: string): string {
  const layout =
    discovery.layout ??
    selectApplicationLayout(discovery.projectRoot, [
      ...discovery.artifacts.map((artifact) => ({ file: artifact.path, kind: artifact.kind })),
      ...discovery.services.map((service) => ({ file: service.path, kind: "service" })),
    ]);
  if (layout.issues.length)
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.invalidProject,
      layout.issues.map((issue) => `${issue.file}: ${issue.message}`).join("\n"),
    );
  const existing = discovery.services.find((service) => service.domain === name);
  if (existing) return existing.path;
  const root = layout.kind === "grouped" ? "src/services" : "src";
  return `${root}/${name}/service.ts`;
}
