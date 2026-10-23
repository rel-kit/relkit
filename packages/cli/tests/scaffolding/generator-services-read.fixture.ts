/** Implements isolated in-memory filesystem read operations using the original request-owned state; methods remain lazy and preserve native fixture failures. */

import { dirname, relative } from "node:path";
import { Effect, Ref } from "effect";
import type { GeneratorFileSystemService } from "create-relkit/internal/generator-filesystem.types";
import type { MemoryFileState, RequiredFile } from "./generator-services.fixture.types.js";

/** Builds the read portion of the original test filesystem service.
 * @param files - Original request-local file Ref, shared by every operation.
 * @param dirs - Original request-local directory set.
 * @param required - Original missing-file checked lookup.
 * @returns Lazy service methods with the unchanged byte, mode and error behavior.
 */
export function readOperations(
  files: MemoryFileState,
  dirs: Set<string>,
  required: RequiredFile,
): Pick<
  GeneratorFileSystemService,
  "readText" | "readBytes" | "access" | "metadata" | "entries" | "glob"
> {
  return {
    readText: (path) => required(path).pipe(Effect.map((file) => file.content)),
    readBytes: (path) =>
      required(path).pipe(Effect.map((file) => new TextEncoder().encode(file.content))),
    access: (path) => required(path).pipe(Effect.asVoid),
    metadata: (path) =>
      Ref.get(files).pipe(
        Effect.map((state) =>
          state.has(path)
            ? { kind: "file" as const, mode: state.get(path)?.mode ?? 0o644 }
            : dirs.has(path)
              ? { kind: "directory" as const, mode: 0o755 }
              : undefined,
        ),
      ),
    entries: (path) =>
      Ref.get(files).pipe(
        Effect.map((state) =>
          [...state.keys()]
            .filter((file) => dirname(file) === path)
            .map((file) => ({ name: relative(path, file), kind: "file" as const })),
        ),
      ),
    glob: (root) =>
      Ref.get(files).pipe(
        Effect.map((state) =>
          [...state.keys()]
            .filter((path) => path.startsWith(root + "/src/") && path.endsWith(".ts"))
            .map((path) => relative(root, path))
            .sort(),
        ),
      ),
  };
}
