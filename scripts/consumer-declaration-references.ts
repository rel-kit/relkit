/**
 * Inventories external references in emitted declaration files with TypeScript's
 * existing preprocessor. It reads bytes without loading modules or resolving
 * peers. External strict typechecks remain the authority for consumed types.
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";
import { Effect } from "effect";
import { inspectionNative } from "./consumer-installation-native.js";

/**
 * Reads emitted declaration references for a source package, serially.
 * @param root - Package source root whose dist is inspected.
 * @returns External package specifiers mapped to exact declaration filenames.
 */
export const declarationReferences = Effect.fn("ConsumerOwnership.declarations")(function* (
  root: string,
) {
  const references = new Map<string, string[]>(),
    pending = [join(root, "dist")];
  for (const current of pending) {
    const entries = yield* inspectionNative("declarations.entries", () =>
      readdir(current, { withFileTypes: true }).catch((cause) => {
        if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return [];
        throw cause;
      }),
    );
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "inspector" || entry.name === "templates")
        continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.name.endsWith(".d.ts")) continue;
      const text = yield* inspectionNative("declarations.read", () => readFile(path, "utf8"));
      for (const imported of ts.preProcessFile(text, true).importedFiles) {
        const name = imported.fileName;
        if (name.startsWith(".") || name.startsWith("node:")) continue;
        const parts = name.split("/");
        const dependency = name.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
        if (dependency === undefined) continue;
        const files = references.get(dependency) ?? [];
        files.push(relative(root, path));
        references.set(dependency, files);
      }
    }
  }
  return references;
});
