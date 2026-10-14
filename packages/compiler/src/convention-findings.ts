/**
 * Computes nonfatal convention warnings from validated descriptor/provenance data.
 * Physical service roots determine suggestions; logical identity and registration
 * remain compiler responsibilities and no warning changes activation by itself.
 */
import { createDiagnostic } from "@relkit/diagnostics";
import {
  diagnosticLocation,
  recommendedPattern,
  hasExportWarning,
  descriptorKinds,
} from "./conventions-support.js";
import type {
  ConventionCheckInput,
  ConventionCode,
  ConventionFindingContext,
  KindRule,
} from "./conventions.types.js";

/** Stable compatibility codes for nonfatal authoring guidance. */
export const CONVENTION_CODES = Object.freeze({
  directory: "RELKIT_CONVENTION_DIRECTORY",
  suffix: "RELKIT_CONVENTION_SUFFIX",
  export: "RELKIT_CONVENTION_EXPORT",
  multipleKinds: "RELKIT_CONVENTION_MULTIPLE_KINDS",
  idStyle: "RELKIT_CONVENTION_ID_STYLE",
} as const);

/**
 * Collects physical-placement and logical-identity suggestions in existing order.
 * @param input - Guarded descriptor and decoded source/export metadata.
 * @param path - Normalized physical authored source path.
 * @param rule - Layout-aware category and suffix recommendation.
 * @returns Frozen warnings preserving existing severity and diagnostic codes.
 */
export function conventionFindings(input: ConventionCheckInput, path: string, rule: KindRule) {
  const context: ConventionFindingContext = { input, path, diagnostics: [] };
  pathFindings(context, rule);
  identityFindings(context);
  return Object.freeze(context.diagnostics);
}

/**
 * Checks category/suffix/export conventions without converting them to hard boundaries.
 * @param context - Invocation-owned warnings and physical provenance.
 * @param rule - Selected layout's kind-specific naming convention.
 * @returns Nothing; warnings accumulate in deterministic order.
 */
function pathFindings(context: ConventionFindingContext, rule: KindRule): void {
  const { input, path } = context;
  const descriptor = input.descriptor;
  const pattern = recommendedPattern(rule);
  const fileName = path.split("/").pop() ?? "";
  if (
    descriptor.kind !== "route" &&
    descriptor.kind !== "app" &&
    !path.startsWith(`${rule.directory}/`)
  ) {
    append(
      context,
      CONVENTION_CODES.directory,
      `Descriptor "${descriptor.id}" has kind "${descriptor.kind}" outside its recommended directory.`,
      `Move the descriptor under ${pattern}`,
    );
  }
  if (descriptor.kind !== "route" && !fileName.endsWith(rule.suffix)) {
    append(
      context,
      CONVENTION_CODES.suffix,
      `Descriptor "${descriptor.id}" does not use the recommended "${rule.suffix}" suffix.`,
      `Rename the file to use ${rule.suffix}`,
    );
  }
  if (descriptor.kind !== "route" && hasExportWarning(input)) {
    append(
      context,
      CONVENTION_CODES.export,
      `Descriptor file should default-export "${descriptor.id}".`,
      `Export "${descriptor.id}" as the file's default descriptor`,
    );
  }
}

/**
 * Checks kind mixing and ID style while retaining all supported descriptor identities.
 * @param context - Invocation-owned warnings and validated source metadata.
 * @returns Nothing; these findings remain suggestions, never structural errors.
 */
function identityFindings(context: ConventionFindingContext): void {
  const descriptor = context.input.descriptor;
  const kinds = descriptorKinds(context.input, descriptor);
  if (kinds.length > 1)
    append(
      context,
      CONVENTION_CODES.multipleKinds,
      `File contains descriptors of multiple kinds: ${kinds.join(", ")}.`,
      "Keep unrelated descriptor kinds in separate files",
    );
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(descriptor.id))
    append(
      context,
      CONVENTION_CODES.idStyle,
      `Descriptor ID "${descriptor.id}" is not in the recommended lower-case dot/kebab style.`,
      "Use lower-case alphanumeric segments separated by dots or hyphens",
    );
}

/**
 * Creates one portable warning with the original descriptor and source coordinates.
 * @param context - Invocation-owned accumulator and validated provenance.
 * @param code - Stable compatibility diagnostic code.
 * @param message - Explanation of the nonfatal convention mismatch.
 * @param suggestion - Layout-aware source placement or naming recommendation.
 * @returns Nothing; no source or runtime output is mutated.
 */
function append(
  context: ConventionFindingContext,
  code: ConventionCode,
  message: string,
  suggestion: string,
): void {
  const { input, path } = context;
  const location = diagnosticLocation(path, input);
  context.diagnostics.push(
    createDiagnostic(
      {
        code,
        severity: "warning",
        message,
        descriptorId: input.descriptor.id,
        ...(location === undefined ? {} : { location }),
        suggestion,
      },
      input.projectRoot === undefined ? {} : { projectRoot: input.projectRoot },
    ),
  );
}
