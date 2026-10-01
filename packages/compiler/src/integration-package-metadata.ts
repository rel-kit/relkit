import { IntegrationPackageValidationError } from "./integration-package-errors.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import { isAbsolute, relative } from "node:path";

import type { RuntimeIntegrationPackage } from "./normalize-types.js";

/**
 * Rejects imports outside an integration's declared authoring export.
 * @param manifest - Parsed package metadata.
 * @param specifier - Literal module import specifier.
 * @returns A lazy effect yielding void or failing with IntegrationPackageValidationError; getter defects propagate.
 */
export const assertAuthoringImportEffect = Effect.fn("Compiler.assertAuthoringImport")(
  function* (manifest: Record<string, unknown>, specifier: string) {
    const metadata = integrationMetadata(manifest);
    if (metadata === undefined) return;
    const name = manifest.name;
    const authoring = record(metadata.exports)?.authoring;
    if (typeof name !== "string" || typeof authoring !== "string")
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError("Integration authoring export metadata is invalid."),
      });
    const expected = authoring === "." ? name : `${name}/${authoring.replace(/^\.\//, "")}`;
    if (specifier !== expected)
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(
          `Application integration import "${specifier}" is not an authoring export.`,
        ),
      });
  },
  (effect) => observeCompiler("configuration", "assertAuthoringImport", effect),
);

/**
 * Checks the authoring export at the synchronous compatibility boundary.
 * @param manifest - Parsed package metadata.
 * @param specifier - Literal module import specifier.
 * @returns Nothing when the authoring export is accepted or metadata is absent.
 * @throws IntegrationPackageValidationError for invalid authoring metadata or export selection.
 */
export function assertAuthoringImport(manifest: Record<string, unknown>, specifier: string): void {
  return runCompilerSync(assertAuthoringImportEffect(manifest, specifier));
}

/**
 * Selects declared integration metadata from a package manifest.
 * @param manifest - Parsed package metadata.
 * @returns The declared integration metadata record, or undefined.
 */
export function integrationMetadata(
  manifest: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return record(record(manifest.relkit)?.integration);
}

/**
 * Selects an integration target from a catalog package export.
 * @param manifest - Parsed package metadata.
 * @param specifier - Literal module import specifier.
 * @returns A lazy effect yielding the target or undefined, with IntegrationPackageValidationError for invalid catalog metadata.
 */
export const catalogTargetEffect = Effect.fn("Compiler.catalogTarget")(
  function* (manifest: Record<string, unknown>, specifier: string) {
    const name = manifest.name;
    if (typeof name !== "string") return undefined;
    const suffix = specifier.slice(name.length);
    const target = record(record(manifest.relkit)?.catalog)?.[suffix === "" ? "." : `.${suffix}`];
    if (target === undefined) return undefined;
    if (typeof target !== "string" || target.trim() === "")
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Catalog package "${name}" has an invalid integration target.`),
      });
    return target;
  },
  (effect) => observeCompiler("configuration", "catalogTarget", effect),
);

/**
 * Selects a catalog target at the synchronous compatibility boundary.
 * @param manifest - Parsed package metadata.
 * @param specifier - Literal module import specifier.
 * @returns The declared target, or undefined when no catalog entry exists.
 * @throws IntegrationPackageValidationError for invalid target metadata.
 */
export function catalogTarget(
  manifest: Record<string, unknown>,
  specifier: string,
): string | undefined {
  return runCompilerSync(catalogTargetEffect(manifest, specifier));
}

/**
 * Checks lexical containment between canonical package paths.
 * @param root - Canonical root used for path resolution.
 * @param target - Target contract or metadata being checked.
 * @returns True when the canonical target stays within the canonical package root.
 */
export function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/**
 * Narrows nonarray metadata objects without coercing their values.
 * @param value - Declared metadata inspected without coercion.
 * @returns The nonarray record, or undefined without coercion.
 */
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Orders integration package registrations deterministically.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
export function compare(left: RuntimeIntegrationPackage, right: RuntimeIntegrationPackage): number {
  return (
    left.integrationId.localeCompare(right.integrationId) ||
    left.packageName.localeCompare(right.packageName) ||
    left.packageVersion.localeCompare(right.packageVersion) ||
    left.exportName.localeCompare(right.exportName)
  );
}
