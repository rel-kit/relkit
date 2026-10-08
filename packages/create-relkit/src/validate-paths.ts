import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { Effect } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import { GeneratorPaths } from "./generator-paths.js";

import { domainError } from "./generator-errors.js";

import type { DestinationState } from "./validate.types.js";

import { CreateValidationError } from "./validate-errors.js";
/**
 * Inspects only an absent or real directory destination without following symlinks.
 * @param path - Path inside the current project or owned resource.
 * @returns Destination existence and emptiness flags; symlinks and non-directories fail.
 */
export const inspectDestinationEffect = Effect.fn("CreateValidation.inspect")(
  function* (
    path: string,
  ): Effect.fn.Return<
    DestinationState,
    import("./generator-errors.js").GeneratorDomainError,
    GeneratorPaths
  > {
    const paths = yield* GeneratorPaths;
    const info = yield* paths
      .metadata(path)
      .pipe(Effect.mapError(() => invalid("Destination could not be inspected.")));
    if (info === undefined) return { exists: false, empty: false };
    if (info.kind === "symlink")
      return yield* failure(
        "RELKIT_CREATE_DESTINATION_UNSAFE",
        "Destination must not be a symbolic link.",
      );
    if (info.kind !== "directory")
      return yield* failure("RELKIT_CREATE_DESTINATION_INVALID", "Destination is not a directory.");
    const entries = yield* paths
      .entries(path)
      .pipe(Effect.mapError(() => invalid("Destination directory could not be read.")));
    return { exists: true, empty: entries.length === 0 };
  },
  (effect) => observeExecution("generator", "validation.inspect", effect),
);

/**
 * Canonicalizes missing child segments only after proving the existing parent is a directory.
 * @param path - Path inside the current project or owned resource.
 * @returns The canonical path rebuilt from its existing ancestor and complete missing segments.
 */
export const canonicalizeMissingPathEffect = Effect.fn("CreateValidation.canonicalize")(
  function* (path: string) {
    const paths = yield* GeneratorPaths;
    let current = path;
    const missing: string[] = [];
    for (;;) {
      const info = yield* paths
        .metadata(current)
        .pipe(Effect.mapError(() => invalid("Destination path could not be resolved.")));
      if (info !== undefined) {
        if (missing.length > 0 && info.kind !== "directory")
          return yield* failure(
            "RELKIT_CREATE_DESTINATION_INVALID",
            "A destination parent is not a directory.",
          );
        if (missing.length === 0 && info.kind === "symlink")
          return yield* failure(
            "RELKIT_CREATE_DESTINATION_UNSAFE",
            "Destination must not be a symbolic link.",
          );
        const base = yield* paths
          .realpath(current)
          .pipe(Effect.mapError(() => invalid("Destination path could not be resolved.")));
        return missing.reverse().reduce((parent, part) => join(parent, part), base);
      }
      const parent = dirname(current);
      if (parent === current)
        return yield* failure(
          "RELKIT_CREATE_DESTINATION_INVALID",
          "Destination path could not be resolved.",
        );
      missing.push(basename(current));
      current = parent;
    }
  },
  (effect) => observeExecution("generator", "validation.canonicalize", effect),
);

/**
 * Resolves an existing real directory without permitting symlink indirection.
 * @param path - Path inside the current project or owned resource.
 * @param label - Human-readable location included in validation diagnostics.
 * @returns The canonical existing directory path; symlinks and non-directories fail.
 */
export const existingDirectoryEffect = Effect.fn("CreateValidation.existingDirectory")(
  function* (path: string, label: string) {
    const paths = yield* GeneratorPaths;
    const resolved = resolve(path);
    const info = yield* paths
      .metadata(resolved)
      .pipe(Effect.mapError(() => invalid(`${label} could not be resolved.`)));
    if (info === undefined)
      return yield* failure("RELKIT_CREATE_DESTINATION_INVALID", `${label} could not be resolved.`);
    if (info.kind !== "directory")
      return yield* failure("RELKIT_CREATE_DESTINATION_INVALID", `${label} is not a directory.`);
    return yield* paths
      .realpath(resolved)
      .pipe(Effect.mapError(() => invalid(`${label} could not be resolved.`)));
  },
  (effect) => observeExecution("generator", "validation.existingDirectory", effect),
);

/**
 * Checks a canonical path relationship using no I/O.
 * @param parent - Canonical proposed ancestor path.
 * @param child - Canonical descendant path tested against the ancestor.
 * @returns Whether the child is equal to or nested beneath the canonical parent.
 */
export function isAncestorOrSame(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

/**
 * Carries existing validation failures in the internal typed channel.
 * @param message - User-facing diagnostic or prompt text.
 * @returns A GeneratorDomainError retaining RELKIT_CREATE_DESTINATION_INVALID.
 */
export function invalid(message: string) {
  return domainError(new CreateValidationError("RELKIT_CREATE_DESTINATION_INVALID", message));
}

/**
 * Constructs a typed failure retaining the exact public validation code and message.
 * @param code - Stable public validation code.
 * @param message - User-facing diagnostic or prompt text.
 * @returns An Effect failing with the original CreateValidationError code and message.
 */
export function failure(code: string, message: string) {
  return Effect.fail(domainError(new CreateValidationError(code, message)));
}
