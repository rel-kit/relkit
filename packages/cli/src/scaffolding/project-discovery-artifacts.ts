/**
 * Projects compiler-recognized descriptor syntax into scaffold artifact records.
 * Shared layout paths supply service names; database/auth keep native capability
 * metadata and ordinary modules remain excluded from descriptor registration.
 */

import { prefilterSources, type AstSourceModule } from "@relkit/compiler";
import { serviceSource, normalizeSourcePath } from "@relkit/contracts";
import { readFactoryStringProperty } from "./source-edit.js";
import { discoverDatabaseDetails } from "./project-discovery-database.js";
import { serviceMembers } from "./project-discovery-members.js";
import type { FactoryContext, DiscoveredCollections } from "./project-discovery-artifacts.types.js";
import type { DiscoveredArtifact, DiscoveredService } from "./project-discovery-types.js";

/**
 * Collects source-only artifacts after compiler layout validation.
 * @param root - Canonical application root.
 * @param modules - Complete unevaluated authored module inventory.
 * @returns Static artifact/service records with accurate flat or grouped paths.
 */
export function collectProjectArtifacts(
  root: string,
  modules: readonly AstSourceModule[],
): DiscoveredCollections {
  const normalized = modules.map((module) => ({
    ...module,
    fileName: normalizeSourcePath(module.fileName, root),
  }));
  const candidates = prefilterSources(normalized, { projectRoot: root }).candidates;
  const sourceByPath = new Map(normalized.map((module) => [module.fileName, module.text]));
  const services: DiscoveredService[] = [];
  const artifacts: DiscoveredArtifact[] = [];
  for (const candidate of candidates) {
    const source = sourceByPath.get(candidate.fileName);
    if (source === undefined) throw new Error("Compiler returned an uninventoried source module.");
    const domain = serviceSource(candidate.fileName)?.name;
    for (const factory of candidate.facts.factoryBindings) {
      const context: FactoryContext = {
        modules: normalized,
        candidate,
        factory,
        source,
        binding: factory.binding ?? fileBinding(candidate.fileName),
        ...(domain === undefined ? {} : { domain }),
      };
      artifacts.push(artifactFor(context));
      const service = serviceFor(context);
      if (service) services.push(service);
    }
  }
  return { services, artifacts };
}

/**
 * Projects one known factory without interpreting its runtime options.
 * @param context - Compiler syntax, physical source and normalized binding evidence.
 * @returns Artifact metadata used for identity/collision and renderer selection.
 */
function artifactFor(context: FactoryContext): DiscoveredArtifact {
  const { candidate, factory, source, binding, domain } = context;
  const exported = [...candidate.facts.exports.entries()].find(
    ([, entry]) => entry.binding === factory.binding || entry.factory === factory,
  );
  const id =
    factory.id === "explicit"
      ? readFactoryStringProperty(
          source,
          candidate.fileName,
          factory.factory,
          "id",
          factory.factory === "definePrompt" || factory.factory === "defineConstants" ? 1 : 0,
        )
      : undefined;
  return {
    kind: factory.kind,
    path: candidate.fileName,
    binding,
    ...(domain === undefined ? {} : { domain }),
    ...(id === undefined ? {} : { id }),
    factory: factory.factory,
    exported: exported !== undefined,
    ...(exported === undefined
      ? {}
      : { exportKind: exported[0] === "default" ? "default" : "named" }),
    options: factory.options,
  };
}

/**
 * Preserves generic versus native database/auth service contracts.
 * @param context - One statically recognized declaration and its owning service path.
 * @returns Service metadata, or absence for nonservice declarations.
 */
function serviceFor(context: FactoryContext): DiscoveredService | undefined {
  const { candidate, factory, source, modules, binding, domain } = context;
  if (factory.kind !== "service" || domain === undefined) return undefined;
  let capability: DiscoveredService["capability"] = "generic";
  if (factory.factory === "defineDrizzleService") capability = "database";
  else if (factory.factory === "defineBetterAuthService") capability = "auth";
  const database =
    capability === "database"
      ? discoverDatabaseDetails(modules, candidate.fileName, source)
      : undefined;
  return {
    domain,
    path: candidate.fileName,
    binding,
    capability,
    ...(database ?? {}),
    members: serviceMembers(
      candidate.facts.serviceMembers.filter((member) => member.service === factory.binding),
      source,
      candidate.fileName,
      factory.factory,
    ),
  };
}

/**
 * Preserves the conventional fallback binding for unnamed factory declarations.
 * @param path - Physical module whose filename supplies a kebab-case stem.
 * @returns Its camel-case stem or artifact when no filename was available.
 */
function fileBinding(path: string): string {
  return (path.split("/").at(-1)?.split(".")[0] ?? "artifact").replace(
    /-([a-z0-9])/g,
    (_, value: string) => value.toUpperCase(),
  );
}
