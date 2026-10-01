import { IntegrationPackageValidationError } from "./integration-package-errors.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import { CompilerPackageSource } from "./integration-package-source.js";
import { dirname, join } from "node:path";

/**
 * Finds the owning package manifest for a canonical module entry.
 * @param specifier - Literal module import specifier.
 * @param base - Canonical directory used for package resolution.
 * @returns A lazy effect requiring CompilerPackageSource, yielding ownership metadata or typed I/O/validation failure; accessor defects propagate.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const loadPackageEffect = Effect.fn("Compiler.loadPackage")(
  function* (specifier: string, base: string) {
    const expectedName = yield* packageNameEffect(specifier);
    const source = yield* CompilerPackageSource;
    const entry = yield* source.resolve(specifier, base);
    for (let directory = dirname(entry); ; directory = dirname(directory)) {
      const manifestPath = join(directory, "package.json");
      if (yield* source.exists(manifestPath)) {
        const manifest = yield* source.readManifest(manifestPath);
        if (manifest.name === expectedName)
          return { root: yield* source.canonical(directory), manifest };
      }
      const parent = dirname(directory);
      if (parent === directory) break;
    }
    return yield* new IntegrationPackageValidationError({
      cause: new TypeError(`Package metadata was not found for "${specifier}".`),
    });
  },
  (effect) => observeCompiler("configuration", "loadPackage", effect),
);

/**
 * Extracts a valid scoped or unscoped package name from an import.
 * @param specifier - Literal module import specifier.
 * @returns A lazy effect yielding a package name or IntegrationPackageValidationError.
 */
export const packageNameEffect = Effect.fn("Compiler.packageName")(
  function* (specifier: string) {
    const segments = specifier.split("/");
    const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
    if (name === undefined || name === "" || name.startsWith(".") || name.includes(":"))
      return yield* new IntegrationPackageValidationError({
        cause: new TypeError(`Integration import "${specifier}" is not a package specifier.`),
      });
    return name;
  },
  (effect) => observeCompiler("configuration", "packageName", effect),
);

/**
 * Extracts a package name at the synchronous compatibility boundary.
 * @param specifier - Literal module import specifier.
 * @returns The scoped or unscoped package name.
 * @throws IntegrationPackageValidationError for an invalid package specifier.
 */
export function packageName(specifier: string): string {
  return runCompilerSync(packageNameEffect(specifier));
}
