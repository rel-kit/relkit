import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";

import { normalizeArtifactName, type NormalizedArtifactName } from "./add-name.js";

import { PlanBuilder } from "./plan-builder.js";

import type { DiscoveredArtifact } from "./project-discovery-types.js";

/**
 * Derives a normalized source path, descriptor ID and binding for one domain artifact.
 * @param target - Discovered domain or artifact target.
 * @param value - Friendly artifact name.
 * @param directory - Artifact subdirectory beneath the owning domain.
 * @param fileSuffix - Suffix between the file stem and .ts extension.
 * @param kindSuffix - Optional suffix appended to the ID and binding.
 * @param exportKind - Default or named source export form.
 * @returns The artifact's normalized name, path, ID, binding and export form.
 */
export function domainArtifact(
  target: DomainTarget,
  value: string,
  directory: string,
  fileSuffix: string,
  kindSuffix?: string,
  exportKind: "default" | "named" = "default",
): DomainArtifact {
  const name = normalizeArtifactName(value);
  const suffix = kindSuffix ? normalizeArtifactName(kindSuffix) : undefined;
  return {
    name,
    path: `src/${target.domain.fileStem}/${directory}/${name.fileStem}.${fileSuffix}.ts`,
    id: `${target.domain.idSegment}.${name.idSegment}${suffix ? `-${suffix.idSegment}` : ""}`,
    binding: `${name.identifier}${suffix ? capitalize(suffix.identifier) : ""}`,
    exportKind,
  };
}

/**
 * Finds an existing artifact by ID, binding or normalized file stem.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param kind - Required artifact kind.
 * @param value - Requested ID, binding or file stem.
 * @returns The matching artifact; an unknown identity raises a usage error.
 */
export function resolveArtifact(
  builder: PlanBuilder,
  target: DomainTarget,
  kind: DiscoveredArtifact["kind"],
  value: string,
): DiscoveredArtifact {
  const normalized = normalizeArtifactName(value);
  const candidates = builder.artifacts.filter(
    (artifact) => artifact.domain === target.domain.fileStem && artifact.kind === kind,
  );
  const exact = candidates.find((artifact) =>
    [artifact.binding, artifact.id, fileStem(artifact.path)].includes(value),
  );
  const normalizedMatch = candidates.find(
    (artifact) =>
      normalizeArtifactName(artifact.binding).fileStem === normalized.fileStem ||
      normalizeArtifactName(fileStem(artifact.path)).fileStem === normalized.fileStem,
  );
  const result = exact ?? normalizedMatch;
  if (result === undefined) usage(`Unknown ${kind} in ${target.domain.fileStem}: ${value}`);
  return result;
}

/**
 * Rejects a descriptor ID already present in discovered or planned artifacts.
 * @param builder - Per-request planning owner.
 * @param id - Proposed descriptor ID.
 * @returns Completion when no artifact owns the ID; otherwise a collision is thrown.
 */
export function assertAvailableId(builder: PlanBuilder, id: string): void {
  if (builder.artifacts.some((artifact) => artifact.id === id)) {
    collision(`Descriptor ID ${id} already exists.`);
  }
}

/**
 * Converts a source path into its @app import alias.
 * @param path - Project-relative src path ending in .ts.
 * @returns An @app module specifier with a .js extension.
 */
export function sourceModule(path: string): string {
  return `@app/${path.replace(/^src\//, "").replace(/\.ts$/, ".js")}`;
}

/**
 * Renders a default or named import declaration.
 * @param binding - Imported binding name.
 * @param module - Module specifier.
 * @param exportKind - Named export selection; otherwise a default import.
 * @returns A complete import statement for the selected export form.
 */
export function sourceImport(
  binding: string,
  module: string,
  exportKind: "default" | "named" | undefined,
): string {
  return exportKind === "named"
    ? `import { ${binding} } from "${module}";`
    : `import ${binding} from "${module}";`;
}

/**
 * Renders a domain's initial generic service declaration.
 * @param domain - Normalized domain identity.
 * @returns Source importing defineService and declaring the normalized service ID.
 */
export function serviceSource(domain: NormalizedArtifactName): string {
  return `import { defineService } from "@relkit/app/services";\n\nexport default defineService({ id: "${domain.idSegment}" });\n`;
}

/**
 * Rejects unsupported or incomplete scaffold arguments.
 * @param message - Diagnostic explaining the unsupported arguments.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_USAGE.
 */
export function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}

/**
 * Rejects an existing declaration that conflicts with planned output.
 * @param message - Diagnostic explaining the conflicting declaration.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_COLLISION.
 */
export function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}

/**
 * Uppercases the initial character of a nonempty identifier.
 * @param value - Nonempty identifier produced by name normalization.
 * @returns The identifier with its first character capitalized.
 */
export function capitalize(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

/**
 * Reads the file stem before the first extension separator.
 * @param path - Path inside the current project or owned resource.
 * @returns The final path component up to its first dot.
 */
export function fileStem(path: string): string {
  return path.split("/").at(-1)!.split(".")[0]!;
}

import type { DomainTarget, DomainArtifact } from "./domain-planning.types.js";
