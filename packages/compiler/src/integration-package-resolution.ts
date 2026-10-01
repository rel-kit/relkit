import { IntegrationPackageValidationError } from "./integration-package-errors.js";
import { runtimePackageEffect } from "./integration-package-runtime.js";
import {
  catalogTargetEffect,
  assertAuthoringImportEffect,
  compare,
  integrationMetadata,
  record,
  inside,
} from "./integration-package-metadata.js";
import { loadPackageEffect } from "./integration-package-loader.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type {
  ResolveRuntimeIntegrationPackagesOptions,
  ResolveIntegrationPackageRoleOptions,
  ResolvedIntegrationPackageRole,
} from "./integration-package-resolution.types.js";
export type {
  ResolveRuntimeIntegrationPackagesOptions,
  ResolveIntegrationPackageRoleOptions,
  ResolvedIntegrationPackageRole,
  IntegrationPackageRole,
} from "./integration-package-resolution.types.js";
import { CompilerPackageSource, CompilerPackageSourceLive } from "./integration-package-source.js";
export {
  CompilerPackageSource,
  CompilerPackageSourceLive,
  IntegrationPackageIoError,
} from "./integration-package-source.js";

import type { RuntimeIntegrationPackage } from "./normalize-types.js";

/**
 * Resolves deduplicated authoring imports into validated runtime package registrations.
 * @param options - Caller-supplied configuration for this operation.
 * @returns A lazy effect that resolves deduplicated authoring imports into validated runtime package registrations; unexpected access failures remain defects.
 * @remarks Requires CompilerPackageSource. Invalid metadata fails with IntegrationPackageValidationError;
 * native resolution and reads fail with IntegrationPackageIoError. Package code is never imported.
 * @see {@link CompilerPackageSource} for the checked layer provisioning example.
 */
export const resolveRuntimeIntegrationPackagesEffect = Effect.fn(
  "Compiler.resolveRuntimeIntegrationPackages",
)(
  function* (options: ResolveRuntimeIntegrationPackagesOptions) {
    const byId = new Map<string, RuntimeIntegrationPackage>();
    for (const specifier of [...new Set(options.imports)].sort()) {
      const imported = yield* loadPackageEffect(specifier, options.projectRoot);
      const target = yield* catalogTargetEffect(imported.manifest, specifier);
      if (target === undefined) yield* assertAuthoringImportEffect(imported.manifest, specifier);
      const selected =
        target === undefined ? imported : yield* loadPackageEffect(target, imported.root);
      const entry = yield* runtimePackageEffect(selected);
      if (entry === undefined) continue;
      const existing = byId.get(entry.integrationId);
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(entry)) {
        return yield* new IntegrationPackageValidationError({
          cause: new TypeError(
            `Integration ID "${entry.integrationId}" is owned by multiple packages.`,
          ),
        });
      }
      byId.set(entry.integrationId, entry);
    }
    return Object.freeze([...byId.values()].sort((left, right) => compare(left, right)));
  },
  (effect) => observeCompiler("configuration", "resolveRuntimeIntegrationPackages", effect),
);

/**
 * Resolves deduplicated authoring imports into validated runtime package registrations.
 * @param options - Caller-supplied configuration for this operation.
 * @returns Validated, deduplicated runtime package registrations sorted by identity.
 */
export function resolveRuntimeIntegrationPackages(
  options: ResolveRuntimeIntegrationPackagesOptions,
): readonly RuntimeIntegrationPackage[] {
  return runCompilerSync(
    resolveRuntimeIntegrationPackagesEffect(options).pipe(
      Effect.provide(CompilerPackageSourceLive),
      Effect.mapError((error) => error.cause),
    ),
  );
}

/**
 * Resolves a selected integration role and checks package-root containment.
 * @param options - Caller-supplied configuration for this operation.
 * @returns A lazy effect that resolves a selected integration role and checks package-root containment; unexpected access failures remain defects.
 * @remarks Requires CompilerPackageSource. Metadata and root containment failures use
 * IntegrationPackageValidationError; native resolution failures use IntegrationPackageIoError.
 * @see {@link CompilerPackageSource} for the checked layer provisioning example.
 */
export const resolveIntegrationPackageRoleEffect = Effect.fn(
  "Compiler.resolveIntegrationPackageRole",
)(
  function* (options: ResolveIntegrationPackageRoleOptions) {
    const loaded = yield* loadPackageEffect(options.packageName, options.projectRoot);
    const metadata = integrationMetadata(loaded.manifest);
    const packageVersion = loaded.manifest.version;
    const metadataRole = options.role === "engine" ? "deploymentEngine" : options.role;
    const exportName = record(metadata?.exports)?.[metadataRole];
    if (
      metadata?.id !== options.integrationId ||
      typeof packageVersion !== "string" ||
      typeof exportName !== "string" ||
      !exportName.startsWith("./") ||
      !Object.hasOwn(record(loaded.manifest.exports) ?? {}, exportName)
    ) {
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(
          `Package "${options.packageName}" has no valid ${options.role} export for "${options.integrationId}".`,
        ),
      });
    }
    const source = yield* CompilerPackageSource;
    const resolvedPath = yield* source.resolve(
      `${options.packageName}/${exportName.slice(2)}`,
      loaded.root,
    );
    if (!inside(loaded.root, resolvedPath))
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(
          `Package "${options.packageName}" ${options.role} export escapes its root.`,
        ),
      });
    return Object.freeze({ ...options, packageVersion, exportName, resolvedPath });
  },
  (effect) => observeCompiler("configuration", "resolveIntegrationPackageRole", effect),
);

/**
 * Resolves a selected integration role and checks package-root containment.
 * @param options - Caller-supplied configuration for this operation.
 * @returns Validated package/version/export metadata and its canonical contained path.
 */
export function resolveIntegrationPackageRole(
  options: ResolveIntegrationPackageRoleOptions,
): ResolvedIntegrationPackageRole {
  return runCompilerSync(
    resolveIntegrationPackageRoleEffect(options).pipe(
      Effect.provide(CompilerPackageSourceLive),
      Effect.mapError((error) => error.cause),
    ),
  );
}

export { IntegrationPackageValidationError } from "./integration-package-errors.js";
