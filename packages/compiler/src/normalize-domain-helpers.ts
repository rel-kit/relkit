import { normalizeSourcePath } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { readFacts } from "./discovery/source-facts.js";
import { add } from "./normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";

export const LEGACY_ROOTS = new Set([
  "functions",
  "services",
  "events",
  "errors",
  "jobs",
  "buckets",
  "cache",
  "tools",
  "agents",
  "middleware",
  "transforms",
  "data",
  "constants",
  "prompts",
]);

const SERVICE_BASE_FIELDS = new Set([
  "kind",
  "id",
  "ref",
  "title",
  "description",
  "tags",
  "capability",
  "handler",
]);

export function assignDomain(descriptor: NormalizedDescriptor): NormalizedDescriptor {
  const domainId = domainFor(descriptor.source.file);
  return domainId === undefined ? descriptor : { ...descriptor, domainId };
}

export function validateServiceFile(
  work: NormalizationWork,
  domain: string,
  text: string | undefined,
): void {
  if (text === undefined) return;
  const source = ts.createSourceFile(
    `src/${domain}/service.ts`,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const facts = readFacts(source);
  const factories = facts.factoryBindings.filter(({ kind }) => kind === "service");
  const serviceExports = [...facts.exports.values()].filter(
    ({ factory }) => factory?.kind === "service",
  );
  if (factories.length !== 1 || serviceExports.length !== 1 || facts.exports.size !== 1) {
    domainDiagnostic(
      work,
      `src/${domain}/service.ts`,
      `Domain service.ts must construct and export exactly one service runtime value.`,
    );
  }
}

export function validateDomainId(work: NormalizationWork, descriptor: NormalizedDescriptor): void {
  const generated = isRecord(descriptor.value) ? descriptor.value.generated : undefined;
  if (isRecord(generated) && generated.generated === true) return;
  const domain = descriptor.domainId!;
  const valid =
    descriptor.kind === "service"
      ? descriptor.id === domain
      : descriptor.id.startsWith(`${domain}.`);
  if (!valid) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.id,
      descriptor.kind === "service"
        ? `Service ID must equal its domain ID "${domain}".`
        : `Domain descriptor ID must start with "${domain}.".`,
    );
  }
}

export function collectPublicMembers(
  work: NormalizationWork,
  service: NormalizedDescriptor,
  descriptors: ReadonlyMap<string, NormalizedDescriptor>,
  publicIds: Set<string>,
): void {
  const value = isRecord(service.value) ? service.value : {};
  for (const [name, member] of Object.entries(value)) {
    if (
      SERVICE_BASE_FIELDS.has(name) ||
      (refKind(member) !== "function" && refKind(member) !== "event")
    )
      continue;
    const memberId = refId(member);
    const target = memberId === undefined ? undefined : descriptors.get(memberId);
    if (target === undefined) {
      add(
        work,
        service,
        NORMALIZE_CODES.missingTarget,
        `Public service member "${name}" does not resolve.`,
      );
    } else if (target.domainId !== service.domainId) {
      add(
        work,
        service,
        NORMALIZE_CODES.domain,
        `Service member "${name}" belongs to another domain.`,
        "error",
        target,
      );
    } else publicIds.add(target.id);
  }
}

export function domainFor(file: string): string | undefined {
  const parts = file.replaceAll("\\", "/").split("/");
  return parts[0] === "src" && parts.length > 2 && parts[1] !== "routes" && parts[1] !== "platform"
    ? parts[1]
    : undefined;
}

export function sourcePath(file: string, work: NormalizationWork): string {
  try {
    return normalizeSourcePath(file, work.input.projectRoot);
  } catch {
    return file.replaceAll("\\", "/").replace(/^\.\//, "");
  }
}

export function domainDiagnostic(work: NormalizationWork, file: string, message: string): void {
  work.diagnostics.push(
    createDiagnostic({
      code: NORMALIZE_CODES.domain,
      severity: "error",
      message,
      location: { file, line: 1, column: 1 },
    }),
  );
}
