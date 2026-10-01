import { SourceLocationError } from "@relkit/contracts";
import { normalizeSourcePath } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { readFactsEffect } from "./discovery/source-facts.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
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

/**
 * Attaches domain ownership derived from a descriptor source path.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns The descriptor with domain ownership inferred from its source path.
 */
export function assignDomain(descriptor: NormalizedDescriptor): NormalizedDescriptor {
  const domainId = domainFor(descriptor.source.file);
  return domainId === undefined ? descriptor : { ...descriptor, domainId };
}

/**
 * Checks a domain's required service source file and exports.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param domain - Source domain identity.
 * @param text - Unevaluated authored source text.
 * @returns A lazy effect updating domain diagnostics; unexpected AST defects propagate.
 */
export const validateServiceFileEffect = Effect.fn("Compiler.validateServiceFile")(
  function* (work: NormalizationWork, domain: string, text: string | undefined) {
    if (text === undefined) return;
    const source = ts.createSourceFile(
      `src/${domain}/service.ts`,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const facts = yield* readFactsEffect(source);
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
  },
  (effect) => observeCompiler("normalization", "validateServiceFile", effect, () => ({ files: 1 })),
);

/** Checks a service source at the synchronous compatibility boundary. */
export function validateServiceFile(
  work: NormalizationWork,
  domain: string,
  text: string | undefined,
): void {
  runCompilerSync(validateServiceFileEffect(work, domain, text));
}

/**
 * Checks descriptor identity against its owning domain.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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

/**
 * Collects graph-visible public service members into the owning indexes.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param service - Service descriptor whose public member references are inspected.
 * @param descriptors - Ordered normalized descriptors.
 * @param publicIds - Caller-owned set of public member identities.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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
      !["function", "event", "task", "job"].includes(refKind(member) ?? "")
    )
      continue;
    const memberId = refId(member);
    const memberKind = refKind(member);
    const target =
      memberId === undefined || memberKind === undefined
        ? undefined
        : descriptors.get(`${memberKind}:${memberId}`);
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
    } else publicIds.add(`${target.kind}:${target.id}`);
  }
}

/**
 * Selects the domain directory from a conventional authored source path.
 * @param file - Portable authored source filename.
 * @returns The conventional domain directory name, or undefined.
 */
export function domainFor(file: string): string | undefined {
  const parts = file.replaceAll("\\", "/").split("/");
  return parts[0] === "src" && parts.length > 2 && parts[1] !== "routes" && parts[1] !== "platform"
    ? parts[1]
    : undefined;
}

/**
 * Normalizes authored source paths for domain checks.
 * @param file - Portable authored source filename.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A portable authored path used for domain ownership checks.
 */
export function sourcePath(file: string, work: NormalizationWork): string {
  try {
    return normalizeSourcePath(file, work.input.projectRoot);
  } catch (error) {
    if (!(error instanceof SourceLocationError)) throw error;
    return file.replaceAll("\\", "/").replace(/^\.\//, "");
  }
}

/**
 * Appends a source-scoped domain contract diagnostic.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param file - Portable authored source filename.
 * @param message - Diagnostic message describing the rejected contract.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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
