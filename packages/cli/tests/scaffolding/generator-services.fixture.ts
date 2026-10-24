/** Provides deterministic in-memory creator filesystem services for CLI scaffolding tests without sharing state between requests. */

import { dirname, relative } from "node:path";
import { Effect, Layer, Ref } from "effect";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";
import { GeneratorIoError } from "create-relkit/internal/generator-errors";
import type { GeneratorFileSystemService } from "create-relkit/internal/generator-filesystem.types";
import { readOperations } from "./generator-services-read.fixture.js";
import { mutationOperations } from "./generator-services-mutate.fixture.js";
import { directoryOperations } from "./generator-services-directories.fixture.js";

/**
 * Acquires an isolated deterministic filesystem Layer with physical byte/mode semantics.
 * @param initial - Initial absolute file paths and contents.
 * @returns Test authority and a read-only snapshot operation for assertions.
 */
export const memoryFileSystem = Effect.fn("Test.memoryFileSystem")(function* (
  initial: Readonly<Record<string, string>>,
) {
  const files = yield* Ref.make(
    new Map(Object.entries(initial).map(([path, content]) => [path, { content, mode: 0o644 }])),
  );
  const dirs = new Set<string>();
  for (const path of Object.keys(initial))
    for (let p = dirname(path); !dirs.has(p); p = dirname(p)) dirs.add(p);
  const required = (path: string) =>
    Ref.get(files).pipe(
      Effect.flatMap((state) => {
        const value = state.get(path);
        return value === undefined ? Effect.fail(ioError("read", path)) : Effect.succeed(value);
      }),
    );
  const service: GeneratorFileSystemService = {
    ...readOperations(files, dirs, required),
    ...mutationOperations(files, required),
    ...directoryOperations(dirs),
  };
  return {
    service,
    layer: Layer.succeed(GeneratorFileSystem, service),
    snapshot: Ref.get(files).pipe(Effect.map((state) => new Map(state))),
  };
});

/**
 * Constructs the native-compatible missing-file diagnostic used by test authority.
 * @param operation - Fixed adapter operation.
 * @param path - Test path, retained only in explicit error diagnostics.
 * @returns A typed I/O error preserving its native errno.
 */
function ioError(operation: string, path: string): GeneratorIoError {
  const cause = Object.assign(new Error("Missing file: " + path), { code: "ENOENT" });
  return new GeneratorIoError({ operation, cause, message: cause.message });
}
