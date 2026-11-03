import { Context, Effect, Layer, Schema } from "effect";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import type { CompilerPackageSourceService } from "./integration-package-source.types.js";
import { IntegrationPackageValidationError } from "./integration-package-errors.js";
import { observeCompiler } from "./observability.js";

/** Filesystem, module resolution, or JSON syntax failure at the native metadata boundary. */
export class IntegrationPackageIoError extends Schema.TaggedError<IntegrationPackageIoError>()(
  "IntegrationPackageIoError",
  { operation: Schema.String, path: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Package metadata source; compiler operations never import executable package values.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { resolveRuntimeIntegrationPackagesEffect, CompilerPackageSourceLive } from "./integration-package-resolution.js";
 * const packages = Effect.runSync(resolveRuntimeIntegrationPackagesEffect({ projectRoot: process.cwd(), imports: [] }).pipe(Effect.provide(CompilerPackageSourceLive)));
 * ```
 */
export class CompilerPackageSource extends Context.Service<
  CompilerPackageSource,
  CompilerPackageSourceService
>()("relkit/compiler/CompilerPackageSource") {}

/** Bun module resolution and synchronous read-only metadata access at the native edge. */
export const CompilerPackageSourceLive = Layer.effect(
  CompilerPackageSource,
  Effect.sync(() =>
    CompilerPackageSource.of({
      resolve: Effect.fn("CompilerPackageSource.resolve")(
        (specifier: string, base: string) =>
          Effect.try({
            try: () => realpathSync(Bun.resolveSync(specifier, base)),
            catch: (cause) =>
              new IntegrationPackageIoError({ operation: "resolve", path: specifier, cause }),
          }),
        (effect) => observeCompiler("configuration", "packageSourceResolve", effect),
      ),
      exists: Effect.fn("CompilerPackageSource.exists")(
        (path: string) => Effect.sync(() => existsSync(path)),
        (effect) => observeCompiler("configuration", "packageSourceExists", effect),
      ),
      canonical: Effect.fn("CompilerPackageSource.canonical")(
        (path: string) =>
          Effect.try({
            try: () => realpathSync(path),
            catch: (cause) => new IntegrationPackageIoError({ operation: "realpath", path, cause }),
          }),
        (effect) => observeCompiler("configuration", "packageSourceCanonical", effect),
      ),
      readManifest: Effect.fn("CompilerPackageSource.readManifest")(
        function* (path: string) {
          const parsed: unknown = yield* Effect.try({
            try: () => JSON.parse(readFileSync(path, "utf8")),
            catch: (cause) =>
              new IntegrationPackageIoError({ operation: "read-manifest", path, cause }),
          });
          return yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
            parsed,
          ).pipe(
            Effect.mapError(
              () =>
                new IntegrationPackageValidationError({
                  cause: new TypeError(`Package manifest "${path}" must contain a JSON object.`),
                }),
            ),
          );
        },
        (effect) =>
          observeCompiler("configuration", "packageSourceReadManifest", effect, () => ({
            files: 1,
          })),
      ),
    }),
  ),
);
