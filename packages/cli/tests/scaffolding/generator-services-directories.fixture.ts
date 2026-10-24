/** Implements isolated in-memory filesystem directory operations using the original request-owned state; methods remain lazy and preserve native fixture failures. */

import { dirname, relative } from "node:path";
import { Effect, Ref } from "effect";
import type { GeneratorFileSystemService } from "create-relkit/internal/generator-filesystem.types";
import type { MemoryFileState, RequiredFile } from "./generator-services.fixture.types.js";

/** Builds the directory portion of the original test filesystem service.
 * @param dirs - Original request-local directory set.
 * @returns Lazy service methods with the unchanged byte, mode and error behavior.
 */
export function directoryOperations(
  dirs: Set<string>,
): Pick<GeneratorFileSystemService, "mkdir" | "temporaryDirectory" | "removeDirectory"> {
  return {
    mkdir: (path) =>
      Effect.sync(() => {
        for (let p = path; !dirs.has(p); p = dirname(p)) dirs.add(p);
      }),
    temporaryDirectory: (prefix) =>
      Effect.sync(() => {
        const path = prefix + "owned";
        dirs.add(path);
        return path;
      }),
    removeDirectory: (path) =>
      Effect.sync(() => {
        dirs.delete(path);
      }),
  };
}
