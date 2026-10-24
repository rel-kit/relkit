/** Implements isolated in-memory filesystem mutation operations using the original request-owned state; methods remain lazy and preserve native fixture failures. */

import { dirname, relative } from "node:path";
import { Effect, Ref } from "effect";
import type { GeneratorFileSystemService } from "create-relkit/internal/generator-filesystem.types";
import type { MemoryFileState, RequiredFile } from "./generator-services.fixture.types.js";

/** Builds the mutation portion of the original test filesystem service.
 * @param files - Original request-local file Ref, shared by every operation.
 * @param required - Original missing-file checked lookup.
 * @returns Lazy service methods with the unchanged byte, mode and error behavior.
 */
export function mutationOperations(
  files: MemoryFileState,
  required: RequiredFile,
): Pick<GeneratorFileSystemService, "write" | "rename" | "remove" | "chmod"> {
  return {
    write: (path, content, options) =>
      Ref.update(files, (state) =>
        new Map(state).set(path, {
          content: typeof content === "string" ? content : new TextDecoder().decode(content),
          mode: options?.mode ?? state.get(path)?.mode ?? 0o644,
        }),
      ),
    rename: (from, to) =>
      required(from).pipe(
        Effect.flatMap((file) =>
          Ref.update(files, (state) => {
            const next = new Map(state);
            next.delete(from);
            next.set(to, file);
            return next;
          }),
        ),
      ),
    remove: (path) =>
      Ref.update(files, (state) => {
        const next = new Map(state);
        next.delete(path);
        return next;
      }),
    chmod: (path, mode) =>
      required(path).pipe(
        Effect.flatMap((file) =>
          Ref.update(files, (state) => new Map(state).set(path, { ...file, mode })),
        ),
      ),
  };
}
