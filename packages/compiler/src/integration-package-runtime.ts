import { IntegrationPackageValidationError } from "./integration-package-errors.js";

import { integrationMetadata, record, inside } from "./integration-package-metadata.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import type { LoadedPackage } from "./integration-package-resolution.types.js";
import { CompilerPackageSource } from "./integration-package-source.js";

import { isStableId, type RuntimeIntegrationRegistrationMetadata } from "@relkit/contracts";

/**
 * Checks runtime package metadata and resolves its declared export.
 * @param loaded - Owning package root and parsed package manifest.
 * @returns A lazy effect requiring CompilerPackageSource, yielding runtime metadata or undefined, with typed I/O/validation failures; accessor defects propagate.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const runtimePackageEffect = Effect.fn("Compiler.runtimePackage")(
  function* (loaded: LoadedPackage) {
    const metadata = integrationMetadata(loaded.manifest);
    if (metadata === undefined) return undefined;
    const integrationId = metadata.id;
    const packageName = loaded.manifest.name;
    const packageVersion = loaded.manifest.version;
    const runtime = record(record(metadata.exports)?.runtime);
    if (runtime === undefined) return undefined;
    const exportName = runtime.export;
    if (!isStableId(integrationId))
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError("Integration package ID is invalid."),
      });
    if (typeof packageName !== "string" || packageName.trim() === "")
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Integration "${integrationId}" package name is invalid.`),
      });
    if (typeof packageVersion !== "string" || packageVersion.trim() === "")
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Integration "${integrationId}" package version is invalid.`),
      });
    if (typeof exportName !== "string" || !exportName.startsWith("./"))
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Integration "${integrationId}" runtime export is invalid.`),
      });
    const registrations = yield* runtimeRegistrationsEffect(integrationId, runtime.registrations);
    const exports = record(loaded.manifest.exports);
    if (exports === undefined || !Object.prototype.hasOwnProperty.call(exports, exportName))
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Package "${packageName}" does not export "${exportName}".`),
      });
    const source = yield* CompilerPackageSource;
    const resolved = yield* source.resolve(`${packageName}/${exportName.slice(2)}`, loaded.root);
    if (!inside(loaded.root, resolved))
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Package "${packageName}" runtime export escapes its package root.`),
      });
    return Object.freeze({ integrationId, packageName, packageVersion, exportName, registrations });
  },
  (effect) => observeCompiler("configuration", "runtimePackage", effect),
);

/**
 * Validates and sorts unique runtime capability registrations.
 * @param integrationId - Stable integration ownership identity.
 * @param value - Declared metadata inspected without coercion.
 * @returns A lazy effect yielding sorted frozen registrations or IntegrationPackageValidationError; accessor defects propagate.
 */
export const runtimeRegistrationsEffect = Effect.fn("Compiler.runtimeRegistrations")(
  function* (integrationId: string, value: unknown) {
    if (!Array.isArray(value) || value.length === 0)
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Integration "${integrationId}" runtime registrations are invalid.`),
      });
    const registrations: RuntimeIntegrationRegistrationMetadata[] = [];
    for (const entry of value) {
      if (
        !record(entry) ||
        !isStableId(entry.capability) ||
        !isStableId(entry.adapterId) ||
        entry.protocolVersion !== 1
      ) {
        return yield* new IntegrationPackageValidationError({
          cause: new TypeError(`Integration "${integrationId}" runtime registration is invalid.`),
        });
      }
      registrations.push({
        capability: entry.capability,
        adapterId: entry.adapterId,
        protocolVersion: entry.protocolVersion,
      });
    }
    registrations.sort((left, right) =>
      registrationKey(left).localeCompare(registrationKey(right)),
    );
    if (new Set(registrations.map(registrationKey)).size !== registrations.length)
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Integration "${integrationId}" has duplicate runtime registrations.`),
      });
    return Object.freeze(registrations.map((entry) => Object.freeze(entry)));
  },
  (effect, integrationId, value) =>
    observeCompiler("configuration", "runtimeRegistrations", effect, () => ({
      registrations: Array.isArray(value) ? value.length : 0,
    })),
);

/**
 * Validates runtime registrations at the synchronous compatibility boundary.
 * @param integrationId - Stable integration ownership identity.
 * @param value - Untrusted registration metadata.
 * @returns Frozen registrations sorted by capability, adapter, and protocol.
 * @throws IntegrationPackageValidationError for malformed or duplicate registrations.
 */
export function runtimeRegistrations(
  integrationId: string,
  value: unknown,
): readonly RuntimeIntegrationRegistrationMetadata[] {
  return runCompilerSync(runtimeRegistrationsEffect(integrationId, value));
}

/**
 * Encodes capability, adapter, and protocol metadata for stable comparison.
 * @param entry - Validated entry to project.
 * @returns A stable capability/adapter/protocol comparison key.
 */
export function registrationKey(entry: RuntimeIntegrationRegistrationMetadata): string {
  return `${entry.capability}\0${entry.adapterId}\0${entry.protocolVersion}`;
}
