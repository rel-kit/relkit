/** Validates and mutates only owned staged generator files; captured filesystem/error authorities retain native failure and cleanup disposition. */

import { basename, dirname, join, relative, resolve } from "node:path";
import { Effect, Exit } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GenerateProjectError } from "./generate-types.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError } from "./generator-errors.js";
import type { GeneratorDomainError, GeneratorIoError } from "./generator-errors.js";
import { recordCleanupFailure } from "./generator-cleanup.js";
import type { StageCleanupResult } from "./generate-files-utilities.types.js";
export type { StageCleanupResult } from "./generate-files-utilities.types.js";
export { EXAMPLE_PATH_PREFIXES, removeExamplesEffect } from "./generate-examples.js";

/**
 * Cleans only a verified sibling staging directory owned by this generation invocation.
 * @param stage - Owned sibling staging directory, or undefined before acquisition.
 * @param destination - Absolute final project destination.
 * @returns The verified temporary path and whether it was removed, retaining cleanup failures as evidence.
 */
export const cleanupStagedProjectEffect = Effect.fn("ProjectFiles.cleanupStage")(
  function* (stage: string | undefined, destination: string) {
    if (stage === undefined) return { removed: false };
    const temporaryPath = resolve(stage);
    const parent = resolve(dirname(destination));
    const prefix = `.${basename(destination)}-relkit-`;
    if (dirname(temporaryPath) !== parent || !basename(temporaryPath).startsWith(prefix))
      return { removed: false };
    const fs = yield* GeneratorFileSystem;
    const cleanup = yield* Effect.gen(function* () {
      const info = yield* fs.metadata(temporaryPath);
      if (info === undefined) return { temporaryPath, removed: true };
      if (info.kind !== "directory") return { temporaryPath, removed: false };
      yield* fs.remove(temporaryPath, { recursive: true, force: true });
      return { temporaryPath, removed: true };
    }).pipe(
      Effect.catch((cause) =>
        Effect.gen(function* () {
          const result = { temporaryPath, removed: false };
          yield* recordCleanupFailure(Exit.succeed(result), "stage", cause);
          return result;
        }),
      ),
    );
    return cleanup;
  },
  (effect) => observeExecution("generator", "generation.cleanupStage", effect),
);

/**
 * Requires a nonempty source template without importing or executing it.
 * @param path - Path inside the current project or owned resource.
 * @returns Completion when the selected template exists and contains at least one entry.
 */
export const requireTemplateEffect = Effect.fn("ProjectFiles.requireTemplate")(
  function* (path: string) {
    const entries = yield* (yield* GeneratorFileSystem)
      .entries(path)
      .pipe(
        Effect.mapError(() =>
          domainError(
            new GenerateProjectError(
              "RELKIT_CREATE_TEMPLATE_MISSING",
              "Selected template is missing.",
            ),
          ),
        ),
      );
    if (entries.length === 0)
      return yield* Effect.fail(
        domainError(
          new GenerateProjectError(
            "RELKIT_CREATE_TEMPLATE_MISSING",
            "Selected template is missing.",
          ),
        ),
      );
  },
  (effect) => observeExecution("generator", "generation.requireTemplate", effect),
);

/**
 * Checks required template files in stable order before running any installer.
 * @param root - Absolute project or owned resource root.
 * @param paths - Relative paths checked in stable order.
 * @returns Completion when every required relative template file is accessible.
 */
export const requireFilesEffect = Effect.fn("ProjectFiles.requireFiles")(
  function* (root: string, paths: readonly string[]) {
    const fs = yield* GeneratorFileSystem;
    yield* Effect.forEach(paths, (path) =>
      fs
        .access(join(root, path))
        .pipe(
          Effect.mapError(() =>
            domainError(
              new GenerateProjectError(
                "RELKIT_CREATE_TEMPLATE_INVALID",
                `Template file is missing: ${path}`,
              ),
            ),
          ),
        ),
    );
  },
  (effect) => observeExecution("generator", "generation.requireFiles", effect),
);

/**
 * Substitutes exactly one template marker and preserves the established output mode.
 * @param path - Path inside the current project or owned resource.
 * @param before - Unique template marker expected in the authored source.
 * @param after - Literal replacement for that unique marker.
 * @returns Completion after exactly one template marker is replaced and its file mode is restored.
 */
export const replaceOnceEffect = Effect.fn("ProjectFiles.replaceOnce")(
  function* (path: string, before: string, after: string) {
    const fs = yield* GeneratorFileSystem;
    const content = yield* fs.readText(path);
    const first = content.indexOf(before);
    if (first < 0 || first !== content.lastIndexOf(before))
      return yield* Effect.fail(
        domainError(
          new GenerateProjectError(
            "RELKIT_CREATE_TEMPLATE_INVALID",
            `Template substitution is unavailable: ${path}`,
          ),
        ),
      );
    yield* fs.write(path, content.slice(0, first) + after + content.slice(first + before.length));
    yield* fs.chmod(path, 0o644);
  },
  (effect) => observeExecution("generator", "generation.replaceOnce", effect),
);

/**
 * Lists generated source files in deterministic order, excluding generated and installed state.
 * @param root - Absolute project or owned resource root.
 * @param current - Directory currently traversed beneath the project root.
 * @returns Sorted relative file paths, excluding .git, node_modules and .relkit runtime output.
 */
export const listProjectFilesEffect = Effect.fn("ProjectFiles.list")(
  function* (
    root: string,
    current = root,
  ): Effect.fn.Return<string[], GeneratorIoError | GeneratorDomainError, GeneratorFileSystem> {
    const fs = yield* GeneratorFileSystem;
    const result: string[] = [];
    for (const entry of [...(yield* fs.entries(current))].sort(compareNames)) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".relkit")
        continue;
      const path = join(current, entry.name);
      if (entry.kind === "directory") result.push(...(yield* listProjectFilesEffect(root, path)));
      else if (entry.kind === "file") result.push(relative(root, path).replaceAll("\\", "/"));
    }
    return result;
  },
  (effect) => observeExecution("generator", "generation.list", effect),
);

/**
 * Converts a package name to the existing stable RELKIT application identifier.
 * @param name - Authored name or declaration key.
 * @returns A safe unscoped project ID, with app as the empty-normalization fallback.
 */
export function projectId(name: string): string {
  const value = name
    .replace(/^@/, "")
    .replace("/", "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  return value.replace(/^[._-]+/, "").replace(/(?<![._-])[._-]+$/, "") || "app";
}

/**
 * Compares directory names without platform locale dependence.
 * @param left - First value in deterministic comparison.
 * @param right - Second value in deterministic comparison.
 * @returns Negative, zero or positive ordering using a deterministic string comparison.
 */
export function compareNames(left: { name: string }, right: { name: string }): number {
  if (left.name === right.name) return 0;
  return left.name < right.name ? -1 : 1;
}

export {
  cleanupStagedProject,
  requireTemplate,
  requireFiles,
  replaceOnce,
  removeExamples,
  listProjectFiles,
} from "./generate-files-compat.js";
