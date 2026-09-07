import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import { normalizeArtifactName, type NormalizedArtifactName } from "./add-name.js";
import { PlanBuilder } from "./plan-builder.js";
import type { DiscoveredArtifact, DiscoveredService } from "./project-discovery-types.js";
import { addFactoryObjectMember, addSourceImport } from "./source-edit.js";

export interface DomainTarget {
  readonly domain: NormalizedArtifactName;
  readonly servicePath: string;
  readonly service: DiscoveredService | undefined;
}

export interface DomainArtifact {
  readonly name: NormalizedArtifactName;
  readonly path: string;
  readonly id: string;
  readonly binding: string;
  readonly exportKind: "default" | "named";
}

export async function resolveDomain(builder: PlanBuilder): Promise<DomainTarget> {
  const request = builder.request;
  if (request.service && request.createService)
    usage("--service and --create-service are exclusive.");
  if (request.createService) {
    const domain = normalizeArtifactName(request.createService);
    if (builder.discovery.services.some((service) => service.domain === domain.fileStem)) {
      collision(`Service ${domain.fileStem} already exists.`);
    }
    const servicePath = `src/${domain.fileStem}/service.ts`;
    await builder.create(servicePath, serviceSource(domain));
    return { domain, servicePath, service: undefined };
  }
  const generic = builder.discovery.services.filter((service) => service.capability === "generic");
  const selected = request.service
    ? generic.find((service) =>
        [service.domain, service.binding].includes(
          normalizeArtifactName(request.service!).fileStem,
        ),
      )
    : generic.length === 1
      ? generic[0]
      : undefined;
  if (selected === undefined) {
    usage(
      request.service
        ? `Unknown generic service: ${request.service}`
        : generic.length === 0
          ? "No generic service exists; use --create-service <name>."
          : "Multiple generic services exist; use --service <name>.",
    );
  }
  return {
    domain: normalizeArtifactName(selected.domain),
    servicePath: selected.path,
    service: selected,
  };
}

export async function addPublicMember(
  builder: PlanBuilder,
  target: DomainTarget,
  category: "functions" | "events",
  artifact: DomainArtifact,
  artifactPath: string,
): Promise<void> {
  const importPath = sourceModule(artifactPath);
  await builder.update(target.servicePath, (source) => {
    const imported = addSourceImport(
      source,
      target.servicePath,
      sourceImport(artifact.binding, importPath, artifact.exportKind),
    );
    return addFactoryObjectMember(
      imported,
      target.servicePath,
      ["defineService"],
      [category],
      artifact.binding,
      artifact.binding,
    );
  });
}

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

export function assertAvailableId(builder: PlanBuilder, id: string): void {
  if (builder.artifacts.some((artifact) => artifact.id === id)) {
    collision(`Descriptor ID ${id} already exists.`);
  }
}

export function sourceModule(path: string): string {
  return `@app/${path.replace(/^src\//, "").replace(/\.ts$/, ".js")}`;
}

export function sourceImport(
  binding: string,
  module: string,
  exportKind: "default" | "named" | undefined,
): string {
  return exportKind === "named"
    ? `import { ${binding} } from "${module}";`
    : `import ${binding} from "${module}";`;
}

export function serviceSource(domain: NormalizedArtifactName): string {
  return `import { defineService } from "@relkit/app/services";\n\nexport default defineService({ id: "${domain.idSegment}" });\n`;
}

function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}

function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}

function capitalize(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

function fileStem(path: string): string {
  return path.split("/").at(-1)!.split(".")[0]!;
}
