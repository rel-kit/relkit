import { dirname, relative } from "node:path";
import { Effect, Layer, Ref } from "effect";
import { GeneratorFileSystem } from "../src/generator-filesystem.js";
import { GeneratorIoError } from "../src/generator-errors.js";
import type { GeneratorFileSystemService } from "../src/generator-filesystem.types.js";

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
    write: (path, content, options) =>
      Ref.update(files, (state) =>
        new Map(state).set(path, {
          content: typeof content === "string" ? content : new TextDecoder().decode(content),
          mode: options?.mode ?? state.get(path)?.mode ?? 0o644,
        }),
      ),
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
    removeDirectory: (path) =>
      Effect.sync(() => {
        dirs.delete(path);
      }),
    chmod: (path, mode) =>
      required(path).pipe(
        Effect.flatMap((file) =>
          Ref.update(files, (state) => new Map(state).set(path, { ...file, mode })),
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
