import { observeExecution } from "@relkit/contracts/operation";
import { join } from "node:path";
import { Effect } from "effect";
import { buildCatalogPatch } from "./build-catalog.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainTry, hasErrno } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import type { ScaffoldPlan } from "./add-types.js";

/**
 * Detects patch-only installation requirements before a transaction mutates the project.
 * @param plan - Validated scaffold plan.
 * @returns Whether its managed asset or Bun patch declaration changes.
 */
export const dependencyPatchNeedsInstallEffect = Effect.fn("DependencyPatch.needsInstall")(
  function* (plan: ScaffoldPlan) {
    const manifestOperation = plan.operations.find(
      (operation) => operation.path === "package.json",
    );
    if (
      manifestOperation === undefined &&
      !plan.operations.some((operation) => operation.path.startsWith("patches/drizzle-orm@"))
    )
      return false;
    const patch = yield* domainTry(() => buildCatalogPatch("drizzle-orm"));
    if (plan.operations.some((operation) => operation.path === `patches/${patch.key}.patch`))
      return true;
    if (manifestOperation === undefined) return false;
    const next = yield* domainTry(() => patchEntry(manifestOperation.content, patch.key));
    const contents = yield* (yield* GeneratorFileSystem)
      .readText(join(plan.projectRoot, "package.json"))
      .pipe(
        Effect.catchIf(
          (error) => hasErrno(error, "ENOENT"),
          () => Effect.succeed(undefined),
        ),
      );
    const previous =
      contents === undefined ? undefined : yield* domainTry(() => patchEntry(contents, patch.key));
    return next !== previous;
  },
  (effect) => observeExecution("generator", "planning.dependencyPatchNeedsInstall", effect),
);

/**
 * Preserves the patch-installation Promise compatibility API.
 * @param plan - Plan to inspect.
 * @returns Whether patch delivery requires installation even when no package is new.
 */
export function dependencyPatchNeedsInstall(plan: ScaffoldPlan): Promise<boolean> {
  return runGeneratorPromise(dependencyPatchNeedsInstallEffect(plan));
}

/**
 * Selects one patch entry without interpreting unrelated package fields.
 * @param content - Complete bytes or text planned for the destination.
 * @param key - Bun patch key identifying a package and exact version.
 * @returns The string patch asset path for the key, or undefined when no string entry exists.
 */
function patchEntry(content: string, key: string): string | undefined {
  const manifest: unknown = JSON.parse(content);
  if (!isRecord(manifest) || !isRecord(manifest.patchedDependencies)) return undefined;
  const value = manifest.patchedDependencies[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Narrows an unknown value to a non-null object excluding arrays.
 * @param value - Unknown value at the object boundary.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
