import { observeExecution } from "@relkit/contracts/operation";
import { dirname, join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import { resolveCatalogVersion } from "./catalog-resolution.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError, domainTry, errorMessage, hasErrno } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { JsonObject } from "./project-manifest.schemas.js";

/**
 * Resolves authored Bun aliases without replacing declarations or hiding filesystem authority.
 * @param projectRoot - Directory whose nearest catalog owns the aliases.
 * @param dependencies - Specifications to compare with supported concrete versions.
 * @returns Concrete values or a typed invalid-project failure.
 */
export const resolveProjectDependenciesEffect = Effect.fn("ProjectCatalog.resolve")(
  function* (projectRoot: string, dependencies: Readonly<Record<string, string>>) {
    if (!Object.values(dependencies).some((value) => value.startsWith("catalog:")))
      return dependencies;
    const manifest = yield* findCatalogRootEffect(projectRoot);
    return yield* Effect.try({
      try: () =>
        Object.fromEntries(
          Object.entries(dependencies).map(([name, specification]) => [
            name,
            resolveCatalogVersion(manifest, name, specification),
          ]),
        ),
      catch: (error) => invalid(errorMessage(error)),
    });
  },
  (effect) => observeExecution("generator", "planning.resolveProjectDependencies", effect),
);

/**
 * Preserves the project catalog Promise API and authored alias ownership.
 * @param projectRoot - Project directory.
 * @param dependencies - Specifications to resolve.
 * @returns Concrete comparisons; specifications that do not use catalogs remain unchanged.
 */
export function resolveProjectDependencies(
  projectRoot: string,
  dependencies: Readonly<Record<string, string>>,
): Promise<Readonly<Record<string, string>>> {
  return runGeneratorPromise(resolveProjectDependenciesEffect(projectRoot, dependencies));
}

/**
 * Finds the closest catalog-owning manifest through explicit filesystem authority.
 * @param projectRoot - Initial project directory.
 * @returns Decoded catalog owner; missing files are traversed, malformed files reject.
 */
const findCatalogRootEffect = Effect.fn("ProjectCatalog.findOwner")(
  function* (projectRoot: string) {
    const fs = yield* GeneratorFileSystem;
    for (let current = resolve(projectRoot); ; current = dirname(current)) {
      const contents = yield* fs.readText(join(current, "package.json")).pipe(
        Effect.catchIf(
          (error) => hasErrno(error, "ENOENT"),
          () => Effect.succeed(undefined),
        ),
      );
      if (contents !== undefined) {
        const parsed = yield* domainTry(() => JSON.parse(contents) as unknown);
        const manifest = yield* Schema.decodeUnknownEffect(JsonObject)(parsed).pipe(
          Effect.mapError(() => invalid("package.json must contain an object.")),
        );
        const workspaces = yield* Schema.decodeUnknownEffect(JsonObject)(manifest.workspaces).pipe(
          Effect.catch(() => Effect.succeed<Readonly<Record<string, unknown>>>({})),
        );
        if (
          manifest.catalog !== undefined ||
          manifest.catalogs !== undefined ||
          workspaces.catalog !== undefined ||
          workspaces.catalogs !== undefined
        )
          return manifest;
      }
      if (dirname(current) === current) break;
    }
    return yield* Effect.fail(invalid(`No Bun catalog owns project ${projectRoot}.`));
  },
  (effect) => observeExecution("generator", "planning.findCatalogRoot", effect),
);

/**
 * Constructs the existing invalid-project error without losing constructor identity.
 * @param message - User-facing diagnostic or prompt text.
 * @returns A GeneratorDomainError retaining the canonical invalid-project AddScaffoldError.
 */
function invalid(message: string) {
  return domainError(new AddScaffoldError(ADD_FAILURE_CODES.invalidProject, message));
}
