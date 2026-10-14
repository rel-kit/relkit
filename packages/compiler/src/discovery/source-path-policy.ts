/** Verifies native authored ownership alongside portable lexical source normalization. */
import { existsSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { normalizeSourcePathEffect, serviceSource, SourceLocationError } from "@relkit/contracts";
import { Data, Effect } from "effect";
import type { AstSourceModule } from "./ast-prefilter.types.js";
import { observeCompiler } from "../observability.js";

/** Operational native path inspection failure before any application module evaluation. */
export class AuthoredSourceInspectionError extends Data.TaggedError(
  "Compiler.AuthoredSourceInspectionError",
)<{
  /** Portable source whose native ownership could not be verified. */
  readonly file: string;
  /** Original native filesystem error; retained for diagnostics, never source bytes. */
  readonly causeError: Error;
}> {}

/**
 * Normalizes complete authored inputs and rejects case/real-file aliases before evaluation.
 * @param modules - Authored source snapshots, including virtual test inputs.
 * @param projectRoot - Optional native application root.
 * @returns Sorted unique sources, or a typed path/ownership failure.
 */
export const normalizeAuthoredModulesEffect = Effect.fn("Discovery.authoredPaths")(
  function* (modules: readonly AstSourceModule[], projectRoot?: string) {
    const ordered = yield* Effect.forEach(modules, (module) =>
      normalizeSourcePathEffect(module.fileName, projectRoot).pipe(
        Effect.map((fileName) => ({ fileName, text: module.text })),
      ),
    );
    const paths = new Set<string>(),
      physical = new Map<string, string>();
    for (const module of ordered) {
      const key = module.fileName.toLowerCase();
      if (paths.has(key))
        return yield* Effect.fail(
          new SourceLocationError(
            `duplicate or case-colliding authored source: ${module.fileName}`,
          ),
        );
      paths.add(key);
      if (projectRoot === undefined) continue;
      const actual = yield* nativeAuthoredPath(module.fileName, projectRoot);
      if (actual === undefined) continue;
      const previous = physical.get(actual);
      if (previous !== undefined)
        return yield* Effect.fail(
          new SourceLocationError(
            `authored sources alias one physical file: ${previous} and ${module.fileName}`,
          ),
        );
      physical.set(actual, module.fileName);
    }
    return ordered.sort((left, right) => left.fileName.localeCompare(right.fileName));
  },
  (effect, modules, _projectRoot?: string) =>
    observeCompiler("discovery", "authoredPaths", effect, () => ({ files: modules.length })),
);

/**
 * Enforces containment and same-layer/service ownership for existing native source paths.
 * @param file - Portable project-relative source.
 * @param root - Canonical lexical project root.
 * @returns Canonical physical identity, or undefined for a virtual/nonexistent source.
 */
const nativeAuthoredPath = Effect.fn("Discovery.nativeAuthoredPath")(function* (
  file: string,
  root: string,
) {
  const paths = yield* Effect.try({
    try: () => {
      const candidate = join(root, file);
      if (!existsSync(root) || !existsSync(candidate)) return undefined;
      return { physicalRoot: realpathSync(root), physical: realpathSync(candidate) };
    },
    catch: (cause) =>
      new AuthoredSourceInspectionError({
        file,
        causeError:
          cause instanceof Error ? cause : new Error("Native source inspection failed", { cause }),
      }),
  });
  if (paths === undefined) return undefined;
  const { physicalRoot, physical } = paths;
  const target = relative(physicalRoot, physical).replaceAll("\\", "/");
  if (target.startsWith("../") || resolve(physicalRoot, target) !== physical)
    return yield* Effect.fail(new SourceLocationError(`authored symlink escapes project: ${file}`));
  if (sourceOwner(file) !== sourceOwner(target))
    return yield* Effect.fail(
      new SourceLocationError(
        `authored symlink crosses application ownership: ${file} -> ${target}`,
      ),
    );
  return physical;
});

/**
 * Identifies the fixed application ownership layer without inventing descriptor evidence.
 * @param file - Portable physical source path.
 * @returns Reserved layer or service-root shape used to reject aliased ownership.
 */
function sourceOwner(file: string): string {
  if (file.startsWith("src/platform/")) return "platform";
  if (file.startsWith("src/routes/")) return "routes";
  return serviceSource(file)?.root ?? file.split("/")[0] ?? "";
}
