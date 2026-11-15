/** Loads and plans the canonical selected Drizzle repair, validating conflicts before delivery and preserving its release pin and exact patch bytes. */

import { observeExecution } from "relkit/contracts/operation";
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
import { pnpmWorkspacePatchEffect } from "./dependency-patch-workspace.js";
import { projectPackageManager, type PackageManagerName } from "./package-manager.js";

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
 * Plans byte-identical repair ownership without mutating project assets: the `package.json` entry
 * for Bun, the `pnpm-workspace.yaml` entry for pnpm (which ignores the manifest field), and nothing
 * for npm, which applies no patches.
 * @param projectRoot - Project whose asset and manifest will commit together.
 * @param source - Current or already-planned package manifest bytes.
 * @param patch - Verified release-owned repair.
 * @param manager - Package manager the repair is delivered for; by default the project's own.
 * @returns Manifest changes, optional asset and workspace file operations, or the skipped notice.
 */
export const planDependencyPatchEffect = Effect.fn("DependencyPatch.plan")(
  function* (
    projectRoot: string,
    source: string,
    patch: DependencyPatch,
    manager: PackageManagerName = patchManager(projectRoot),
  ) {
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
    if (manager === "npm") {
      const skipped: DependencyPatchPlan = { content: source, notice: SKIPPED_PATCH };
      return skipped;
    }
    const entries = manifest.patchedDependencies ?? {};
    const current = entries[patch.key];
    if (manager !== "pnpm" && current !== undefined && current !== patch.path)
      return yield* collision(`package.json already declares a different patch for ${patch.key}.`);
    const existing = yield* projectPatchContentEffect(projectRoot, patch.path);
    if (existing !== undefined && existing !== patch.content)
      return yield* collision(`${patch.path} already contains a different dependency patch.`);
    const asset =
      existing === undefined
        ? { operation: { path: patch.path, action: "create" as const, content: patch.content } }
        : {};
    if (manager === "pnpm") {
      const workspace = yield* pnpmWorkspacePatchEffect(projectRoot, patch);
      const plan: DependencyPatchPlan = {
        content: source,
        ...asset,
        ...(workspace === undefined ? {} : { workspace }),
      };
      return plan;
    }
    const content =
      current === undefined
        ? `${JSON.stringify({ ...original, patchedDependencies: Object.fromEntries(Object.entries({ ...entries, [patch.key]: patch.path }).sort()) }, null, 2)}\n`
        : source;
    const plan: DependencyPatchPlan = { content, ...asset };
    return plan;
  },
  (effect) => observeExecution("generator", "planning.planDependencyPatch", effect),
);

/** Says why skipping the repair for npm is safe. */
export const SKIPPED_PATCH =
  "Skipped the Drizzle declaration repair: npm does not apply patchedDependencies. This is safe; the repair changes only Drizzle's type declarations, never code that runs.";

/**
 * Delivers repair assets before the first installation inside a generation-owned stage, where the
 * selected manager reads them: `package.json` for Bun, `pnpm-workspace.yaml` for pnpm (pnpm 10 and
 * 11 ignore the `package.json` field). npm applies no patches, so nothing is written for it.
 * @param projectRoot - Disposable staging directory.
 * @param manager - Package manager the project is created for; by default the project's own.
 * @returns The notice to show when the repair was skipped, once the files are ready together.
 */
export const prepareProjectDependencyPatchEffect = Effect.fn("DependencyPatch.prepare")(
  function* (projectRoot: string, manager: PackageManagerName = patchManager(projectRoot)) {
    const source = yield* (yield* GeneratorFileSystem).readText(join(projectRoot, "package.json"));
    const manifest = yield* Schema.decodeUnknownEffect(ProjectManifest)(
      yield* domainTry(() => JSON.parse(source) as unknown),
    ).pipe(Effect.mapError(domainError));
    if (
      manifest.dependencies?.["drizzle-orm"] === undefined &&
      manifest.devDependencies?.["drizzle-orm"] === undefined
    )
      return undefined;
    if (manager === "npm") return SKIPPED_PATCH;
    const patch = yield* readDrizzlePatchEffect();
    const plan = yield* planDependencyPatchEffect(projectRoot, source, patch, manager);
    const operations: ScaffoldFileOperation[] = [
      ...(plan.operation === undefined ? [] : [plan.operation]),
      ...(plan.workspace === undefined ? [] : [plan.workspace]),
      ...(plan.content === source
        ? []
        : [{ path: "package.json", action: "update" as const, content: plan.content }]),
    ];
    yield* validateOperationActionsEffect(projectRoot, operations);
    yield* applyFileOperationsEffect(projectRoot, operations, new Set());
    return undefined;
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
 * @param manager - Package manager the repair is delivered for; by default the project's own.
 * @returns The manifest projection and optional patch file operation after collision preflight.
 */
export function planDependencyPatch(
  projectRoot: string,
  source: string,
  patch: DependencyPatch,
  manager?: PackageManagerName,
): Promise<DependencyPatchPlan> {
  return runGeneratorPromise(planDependencyPatchEffect(projectRoot, source, patch, manager));
}

/**
 * Preserves staging repair delivery's Promise API.
 * @param projectRoot - Absolute project root.
 * @param manager - Package manager the project is created for; by default the project's own.
 * @returns The notice to show when the repair was skipped.
 */
export function prepareProjectDependencyPatch(
  projectRoot: string,
  manager?: PackageManagerName,
): Promise<string | undefined> {
  return runGeneratorPromise(prepareProjectDependencyPatchEffect(projectRoot, manager));
}

/**
 * Reads the manager an existing project names in `packageManager` or by its lockfile. A project
 * that names none keeps the repair, which Bun, the templates' manager, applies.
 * @param projectRoot - Absolute project root.
 * @returns The project's package manager.
 */
export function patchManager(projectRoot: string): PackageManagerName {
  return projectPackageManager(projectRoot, "bun/0.0.0");
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
