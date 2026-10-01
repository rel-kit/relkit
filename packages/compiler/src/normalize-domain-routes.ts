import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { routeSourceFindings } from "./route-source-checks.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";

/**
 * Checks domain service membership and route exposure.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param sources - Source text indexed by project-relative filename.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateDomainServicesAndRoutesEffect = Effect.fn(
  "Compiler.validateDomainServicesAndRoutes",
)(
  function* (work: NormalizationWork, sources: ReadonlyMap<string, string>) {
    validateSpecializedServices(work);
    validateAuthMounts(work);
    for (const [file, text] of sources) validateServiceRouteBindings(work, file, text);
  },
  (effect, work, sources) =>
    observeCompiler("normalization", "validateDomainServicesAndRoutes", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks domain service membership and route exposure.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param sources - Source text indexed by project-relative filename.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateDomainServicesAndRoutes(
  work: NormalizationWork,
  sources: ReadonlyMap<string, string>,
): void {
  return runCompilerSync(validateDomainServicesAndRoutesEffect(work, sources));
}

/**
 * Checks source and identity constraints for specialized domain services.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function validateSpecializedServices(work: NormalizationWork): void {
  const auth = work.descriptors.filter(
    (descriptor) =>
      isRecord(descriptor.value) && descriptor.value.capability?.kind === "better-auth",
  );
  const database = work.descriptors.filter(
    (descriptor) => isRecord(descriptor.value) && descriptor.value.capability?.kind === "drizzle",
  );
  if (auth.length > 1) {
    add(
      work,
      auth[1]!,
      NORMALIZE_CODES.authDuplicate,
      "Only one Better Auth service is supported.",
    );
  }
  if (database.length > 1) {
    add(work, database[1]!, NORMALIZE_CODES.domain, "Only one Drizzle service is supported.");
  }
  if (auth.length > 0 && database.length !== 1) {
    add(
      work,
      auth[0]!,
      NORMALIZE_CODES.domain,
      "Better Auth requires exactly one Drizzle service.",
    );
  }
}

/**
 * Checks authentication service route mounts.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function validateAuthMounts(work: NormalizationWork): void {
  const authServices = work.descriptors.filter(
    (descriptor) =>
      isRecord(descriptor.value) && descriptor.value.capability?.kind === "better-auth",
  );
  for (const service of authServices) {
    const mounts = work.descriptors.filter((descriptor) => {
      const value = isRecord(descriptor.value) ? descriptor.value : {};
      if (descriptor.kind !== "route" || !isRecord(value.auth)) return false;
      return refId(value.auth.service) === service.id;
    });
    if (mounts.length !== 1) {
      add(
        work,
        service,
        NORMALIZE_CODES.authDuplicate,
        mounts.length === 0
          ? "Better Auth service requires one ALL catch-all route mount."
          : "Better Auth service has multiple route mounts.",
      );
      continue;
    }
    const mount = mounts[0]!;
    const value = isRecord(mount.value) ? mount.value : {};
    const path = typeof value.path === "string" ? value.path : "";
    if (value.method !== "ALL" || !/^\/(?:.*\/)?\*[^/]+\??$/.test(path)) {
      add(
        work,
        mount,
        NORMALIZE_CODES.routeExport,
        "Better Auth must mount on one ALL catch-all route.",
      );
    }
  }
}

/**
 * Checks route references against statically declared service exports.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param file - Portable authored source filename.
 * @param text - Unevaluated authored source text.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function validateServiceRouteBindings(work: NormalizationWork, file: string, text: string): void {
  if (!file.startsWith("src/routes/") || !file.endsWith("/route.ts")) return;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const finding of routeSourceFindings(source)) {
    const position = source.getLineAndCharacterOfPosition(finding.node.getStart(source));
    work.diagnostics.push(
      createDiagnostic({
        code: NORMALIZE_CODES.routeExport,
        severity: "error",
        message: finding.message,
        location: { file, line: position.line + 1, column: position.character + 1 },
        ...(finding.replacement
          ? { suggestion: `Replace the binding with ${finding.replacement}.` }
          : {}),
      }),
    );
  }
}
