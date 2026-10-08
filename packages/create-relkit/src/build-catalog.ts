import manifest from "../package.json";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { DependencyPatchDescriptor } from "./dependency-patches.types.js";

/**
 * Reads a concrete dependency version materialized into this package at build time.
 * @param name - External package name declared in the central build catalog.
 * @returns Its release-supported version without requiring the repository root at runtime.
 */
export function buildCatalogDependency(name: string): string {
  const version = record(buildCatalog().dependencies)[name];
  if (
    typeof version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)
  ) {
    invalid(`The generator build catalog has no concrete version for ${name}.`);
  }
  return version;
}

/**
 * Validates the patch descriptor against its centrally materialized dependency version.
 * @param name - Patched external package name.
 * @returns The immutable version, Bun patch key, asset path, and content hash.
 */
export function buildCatalogPatch(name: string): DependencyPatchDescriptor {
  const patch = record(record(buildCatalog().patches)[name]);
  const version = buildCatalogDependency(name);
  if (
    patch.version !== version ||
    patch.key !== `${name}@${version}` ||
    typeof patch.asset !== "string" ||
    !/^patches\/[a-z0-9-]+\.patch$/u.test(patch.asset) ||
    typeof patch.hash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(patch.hash)
  ) {
    invalid(`The generator build catalog has an invalid patch descriptor for ${name}.`);
  }
  return Object.freeze({
    version,
    key: `${name}@${version}`,
    asset: patch.asset,
    hash: patch.hash,
  });
}

/**
 * Reads portable build metadata while preserving unrelated package metadata.
 * @returns The validated object boundary; individual consumers validate their required fields.
 */
function buildCatalog(): Record<string, unknown> {
  return record(record(record(manifest).relkit).buildCatalog);
}

/**
 * Reads an object-valued metadata field with an empty fallback.
 * @param value - Unknown metadata field.
 * @returns The object, or an empty record when the field is not object-valued.
 */
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * Narrows an unknown value to a non-null object excluding arrays.
 * @param value - Unknown value at the object boundary.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rejects missing or inconsistent portable build metadata.
 * @param message - User-facing diagnostic or prompt text.
 * @returns No value; throws the canonical invalid-project AddScaffoldError.
 */
function invalid(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.invalidProject, message);
}
