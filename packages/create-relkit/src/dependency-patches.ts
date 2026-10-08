import { observeExecution } from "@relkit/contracts/operation";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Schema } from "effect";
import { ADD_FAILURE_CODES, AddScaffoldError, type ScaffoldFileOperation } from "./add-types.js";
import {
  applyFileOperationsEffect,
  validateOperationActionsEffect,
} from "./add-transaction-files.js";
import { buildCatalogPatch } from "./build-catalog.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError, domainTry } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { JsonObject, ProjectManifest } from "./project-manifest.schemas.js";
import type { DependencyPatch, DependencyPatchPlan } from "./dependency-patches.types.js";

/**
 * Loads verified Drizzle declaration repairs from source or the owning packed release.
 * @returns The unchanged repair bytes and their catalog-derived project destination.
 * @remarks Packed execution reads only its bundled asset, never a consumer checkout.
 */
export const readDrizzlePatchEffect = Effect.fn("DependencyPatch.read")(
  function* () {
    const fs = yield* GeneratorFileSystem;
    const descriptor = yield* domainTry(() => buildCatalogPatch("drizzle-orm"));
    const modulePath = fileURLToPath(import.meta.url);
    const asset = modulePath.endsWith(".ts")
      ? resolve(dirname(modulePath), "../../../patches/drizzle-orm.patch")
      : resolve(dirname(modulePath), descriptor.asset);
    if ((yield* fs.metadata(asset))?.kind !== "file")
      return yield* invalid("The bundled Drizzle patch is not a regular file.");
    const content = yield* fs.readText(asset);
    if (createHash("sha256").update(content).digest("hex") !== descriptor.hash)
      return yield* invalid("The bundled Drizzle patch does not match its build catalog hash.");
    return Object.freeze({ ...descriptor, path: `patches/${descriptor.key}.patch`, content });
  },
  (effect) => observeExecution("generator", "planning.readDrizzlePatch", effect),
);

/**
 * Plans byte-identical repair ownership without mutating project assets.
 * @param projectRoot - Project whose asset and manifest will commit together.
 * @param source - Current or already-planned package manifest bytes.
 * @param patch - Verified release-owned repair.
 * @returns Manifest changes and optional asset creation.
 */
export const planDependencyPatchEffect = Effect.fn("DependencyPatch.plan")(
  function* (projectRoot: string, source: string, patch: DependencyPatch) {
    const parsed = yield* domainTry(() => JSON.parse(source) as unknown);
    const manifest = yield* Schema.decodeUnknownEffect(ProjectManifest)(parsed).pipe(
      Effect.mapError(() =>
        domainError(
          new AddScaffoldError(
            ADD_FAILURE_CODES.invalidProject,
            "package.json patchedDependencies must contain patch paths.",
          ),
        ),
      ),
    );
    const original = yield* Schema.decodeUnknownEffect(JsonObject)(parsed).pipe(
      Effect.mapError(() =>
        domainError(
          new AddScaffoldError(
            ADD_FAILURE_CODES.invalidProject,
            "package.json must contain an object.",
          ),
        ),
      ),
    );
    const entries = manifest.patchedDependencies ?? {};
    const current = entries[patch.key];
    if (current !== undefined && current !== patch.path)
      return yield* collision(`package.json already declares a different patch for ${patch.key}.`);
    const existing = yield* projectPatchContentEffect(projectRoot, patch.path);
    if (existing !== undefined && existing !== patch.content)
      return yield* collision(`${patch.path} already contains a different dependency patch.`);
    const content =
      current === undefined
        ? `${JSON.stringify({ ...original, patchedDependencies: Object.fromEntries(Object.entries({ ...entries, [patch.key]: patch.path }).sort()) }, null, 2)}\n`
        : source;
    return {
      content,
      ...(existing === undefined
        ? { operation: { path: patch.path, action: "create" as const, content: patch.content } }
        : {}),
    };
  },
  (effect) => observeExecution("generator", "planning.planDependencyPatch", effect),
);

/**
 * Delivers repair assets before the first installation inside a generation-owned stage.
 * @param projectRoot - Disposable staging directory.
 * @returns Completion once the manifest and unchanged patch asset are ready together.
 */
export const prepareProjectDependencyPatchEffect = Effect.fn("DependencyPatch.prepare")(
  function* (projectRoot: string) {
    const source = yield* (yield* GeneratorFileSystem).readText(join(projectRoot, "package.json"));
    const result = yield* planDependencyPatchEffect(
      projectRoot,
      source,
      yield* readDrizzlePatchEffect(),
    );
    const operations: ScaffoldFileOperation[] = result.operation ? [result.operation] : [];
    if (result.content !== source)
      operations.push({ path: "package.json", action: "update", content: result.content });
    yield* validateOperationActionsEffect(projectRoot, operations);
    yield* applyFileOperationsEffect(projectRoot, operations, new Set());
  },
  (effect) => observeExecution("generator", "planning.prepareProjectDependencyPatch", effect),
);

/**
 * Preserves the verified repair Promise API.
 * @returns The validated concrete patch descriptor, versioned project path and canonical patch text.
 */
export function readDrizzlePatch(): Promise<DependencyPatch> {
  return runGeneratorPromise(readDrizzlePatchEffect());
}

/**
 * Preserves patch planning's Promise API and collision constructors.
 * @param projectRoot - Absolute project root.
 * @param source - Authored source text inspected or transformed without execution.
 * @param patch - Validated portable patch descriptor, destination path and canonical bytes.
 * @returns The manifest projection and optional patch file operation after collision preflight.
 */
export function planDependencyPatch(
  projectRoot: string,
  source: string,
  patch: DependencyPatch,
): Promise<DependencyPatchPlan> {
  return runGeneratorPromise(planDependencyPatchEffect(projectRoot, source, patch));
}

/**
 * Preserves staging repair delivery's Promise API.
 * @param projectRoot - Absolute project root.
 * @returns Completion after the existing contract has been applied.
 */
export function prepareProjectDependencyPatch(projectRoot: string): Promise<void> {
  return runGeneratorPromise(prepareProjectDependencyPatchEffect(projectRoot));
}

/**
 * Reads the managed asset without following symlink directories or files.
 * @param projectRoot - Absolute project root.
 * @param path - Path inside the current project or owned resource.
 * @returns Existing regular-file patch text, or undefined when the project has no asset.
 */
const projectPatchContentEffect = Effect.fn("DependencyPatch.readProjectAsset")(
  function* (projectRoot: string, path: string) {
    const fs = yield* GeneratorFileSystem;
    const directory = yield* fs.metadata(join(projectRoot, "patches"));
    if (directory !== undefined && directory.kind !== "directory")
      return yield* collision("patches is not a project directory.");
    const file = resolve(projectRoot, path);
    const metadata = yield* fs.metadata(file);
    if (metadata === undefined) return undefined;
    if (metadata.kind !== "file")
      return yield* collision(`${path} is not a regular dependency patch file.`);
    return yield* fs.readText(file);
  },
  (effect) => observeExecution("generator", "planning.projectPatchContent", effect),
);

/**
 * Constructs an existing invalid-project failure in the typed domain channel.
 * @param message - User-facing diagnostic or prompt text.
 * @returns An Effect failing with the original invalid-project AddScaffoldError.
 */
function invalid(message: string) {
  return Effect.fail(domainError(new AddScaffoldError(ADD_FAILURE_CODES.invalidProject, message)));
}

/**
 * Constructs a typed collision failure preserving its public constructor.
 * @param message - Diagnostic explaining the conflicting declaration.
 * @returns An Effect failing with the original RELKIT_ADD_COLLISION AddScaffoldError.
 */
function collision(message: string) {
  return Effect.fail(domainError(new AddScaffoldError(ADD_FAILURE_CODES.collision, message)));
}
