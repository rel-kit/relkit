/** Validates exact integration authoring selections, catalog routing, and contained package role paths without evaluating SDKs. */
import { IntegrationPackageValidationError } from "./integration-package-errors.js";
import { Effect, Schema } from "effect";
import { IntegrationAuthoringExports } from "./integration-authoring-exports.schemas.js";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import { isAbsolute, relative } from "node:path";

import type { RuntimeIntegrationPackage } from "./normalize-types.js";

/**
 * Rejects imports outside the integration's exact declared authoring exports.
 * @param manifest - Parsed package metadata.
 * @param specifier - Literal module import specifier.
 * @param usage - Source role; only application modules may use public testing helpers.
 * @returns A lazy effect yielding void or failing with IntegrationPackageValidationError; getter defects propagate.
 */
export const assertAuthoringImportEffect = Effect.fn("Compiler.assertAuthoringImport")(
  function* (
    manifest: Record<string, unknown>,
    specifier: string,
    usage: "authoring" | "application" = "authoring",
  ) {
    const metadata = integrationMetadata(manifest);
    if (metadata === undefined) return;
    const name = manifest.name;
    const selected = yield* Schema.decodeUnknownEffect(IntegrationAuthoringExports)(
      record(metadata.exports)?.authoring,
    ).pipe(
      Effect.mapError(
        () =>
          new IntegrationPackageValidationError({
            cause: new TypeError("Integration authoring export metadata is invalid."),
          }),
      ),
    );
    const authoring = typeof selected === "string" ? [selected] : selected;
    const exports = record(manifest.exports);
    if (
      typeof name !== "string" ||
      authoring.length === 0 ||
      authoring.some(
        (leaf) =>
          !/^(?:\.|\.\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)*)$/i.test(leaf) ||
          leaf
            .split("/")
            .slice(1)
            .some((part) => part === "." || part === "..") ||
          exports === undefined ||
          !Object.hasOwn(exports, leaf),
      )
    )
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError("Integration authoring export metadata is invalid."),
      });
    const expected = authoring.map((leaf) => (leaf === "." ? name : `${name}/${leaf.slice(2)}`));
    const testing =
      usage === "application" &&
      specifier === `${name}/testing` &&
      Object.hasOwn(exports ?? {}, "./testing");
    if (!expected.includes(specifier) && !testing)
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
