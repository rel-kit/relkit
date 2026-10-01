import { Effect } from "effect";
import fs from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";
import type { FileDetectorOptions } from "./evaluator-detector-files.types.js";
import { replaceNative } from "./evaluator-detector-native.js";
import type {
  GenericFunction,
  MutableRecord,
  Restore,
  Violate,
} from "./evaluator-detector-native.types.js";
const pathMethods: Readonly<Record<string, readonly number[]>> = {
  writeFile: [0],
  writeFileSync: [0],
  appendFile: [0],
  appendFileSync: [0],
  truncate: [0],
  truncateSync: [0],
  mkdir: [0],
  mkdirSync: [0],
  mkdtemp: [0],
  mkdtempSync: [0],
  rm: [0],
  rmSync: [0],
  rmdir: [0],
  rmdirSync: [0],
  unlink: [0],
  unlinkSync: [0],
  rename: [0, 1],
  renameSync: [0, 1],
  copyFile: [1],
  copyFileSync: [1],
  link: [1],
  linkSync: [1],
  symlink: [1],
  symlinkSync: [1],
  createWriteStream: [0],
};

/**
 * Installs native write guards under the caller's detector ownership.
 * @param options - Project and generated-output sandbox roots.
 * @param restores - Session's reverse-order rollback capabilities.
 * @param violate - Synchronous callback recording and rejecting unsafe native writes.
 * @returns A lazy effect installing available native hooks; assignment failures are defects.
 */
export const installFileDetectorsEffect = Effect.fn("Discovery.installFileDetectors")(
  function* (options: FileDetectorOptions, restores: Restore[], violate: Violate) {
    const targets = [fs as unknown as MutableRecord, (fs.promises ?? {}) as MutableRecord];
    yield* Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          yield* Effect.forEach(
            Object.entries(pathMethods),
            ([name, indices]) =>
              Effect.gen(function* () {
                yield* Effect.sync(() =>
                  patchPathMethod(target, name, indices, options, restores, violate),
                );
              }),
            { discard: true },
          );
          yield* Effect.sync(() => patchOpen(target, options, restores, violate));
        }),
      { discard: true },
    );
    const bun = (typeof Bun === "undefined" ? {} : Bun) as unknown as MutableRecord;
    if (typeof bun.write === "function") {
      const original = bun.write as GenericFunction;
      yield* Effect.sync(() =>
        replaceNative(
          bun,
          "write",
          (...args: unknown[]) => {
            guardPaths("Bun.write", [args[0]], options, violate);
            return original(...args);
          },
          restores,
        ),
      );
    }
  },
  (effect) => observeCompiler("discovery", "installFileDetectors", effect, () => ({}), false),
);

/**
 * Synchronous compatibility boundary for manually owned file hooks.
 * @param options - Sandbox root settings.
 * @param restores - Rollback capabilities retained by the caller.
 * @param violate - Native blocked-write callback.
 * @returns Nothing after installation; caller must roll back partial failures.
 */
export function installFileDetectors(
  options: FileDetectorOptions,
  restores: Restore[],
  violate: Violate,
): void {
  runDiscoverySync(installFileDetectorsEffect(options, restores, violate));
}

/**
 * Adapts a native path-writing method without changing its receiver or return value.
 * @param target - Native filesystem API object.
 * @param name - Method to intercept.
 * @param indices - Argument positions representing write destinations.
 * @param options - Sandbox root settings.
 * @param restores - Session's rollback capabilities.
 * @param violate - Recording rejection boundary.
 * @returns Nothing after registering the synchronous native adapter.
 */
function patchPathMethod(
  target: MutableRecord,
  name: string,
  indices: readonly number[],
  options: FileDetectorOptions,
  restores: Restore[],
  violate: Violate,
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  const method = original as GenericFunction;
  replaceNative(
    target,
    name,
    function (this: unknown, ...args: unknown[]) {
      guardPaths(
        name,
        indices.map((index) => args[index]),
        options,
        violate,
      );
      return method.apply(this, args);
    },
    restores,
  );
}

/**
 * Intercepts writable string flags at native open boundaries.
 * @param target - Native filesystem API object.
 * @param options - Sandbox root settings.
 * @param restores - Session's rollback capabilities.
 * @param violate - Recording rejection boundary.
 * @returns Nothing after registering supported open adapters.
 * @remarks Numeric flags remain outside the existing best-effort detector coverage.
 */
function patchOpen(
  target: MutableRecord,
  options: FileDetectorOptions,
  restores: Restore[],
  violate: Violate,
): void {
  for (const name of ["open", "openSync"]) {
    const original = target[name];
    if (typeof original !== "function") continue;
    const method = original as GenericFunction;
    replaceNative(
      target,
      name,
      function (this: unknown, ...args: unknown[]) {
        const flags = args[1];
        if (typeof flags === "string" && /[wax+]/.test(flags)) {
          guardPaths(name, [args[0]], options, violate);
        }
        return method.apply(this, args);
      },
      restores,
    );
  }
}

/**
 * Enforces generated-directory ownership at a synchronous native write boundary.
 * @param operation - Native API label used in diagnostics.
 * @param values - Native destination arguments.
 * @param options - Project and generated-output sandbox roots.
 * @param violate - Recording rejection boundary.
 * @returns Nothing for permitted writes; rejected writes never reach the native API.
 */
function guardPaths(
  operation: string,
  values: readonly unknown[],
  options: FileDetectorOptions,
  violate: Violate,
): void {
  for (const value of values) {
    const path = filePath(value);
    if (path === undefined || isInside(path, options.generatedDirectory)) continue;
    violate("write-outside-generated-sandbox", operation, displayPath(path, options.projectRoot));
  }
}

/**
 * Projects native string/file-URL arguments into absolute paths.
 * @param value - Opaque native invocation argument.
 * @returns Its absolute path, or undefined for unsupported argument forms.
 */
function filePath(value: unknown): string | undefined {
  if (typeof value === "string") return resolve(value);
  if (value instanceof URL && value.protocol === "file:") return fileURLToPath(value);
  return undefined;
}

/**
 * Tests lexical containment for a native write destination.
 * @param path - Absolute write destination.
 * @param generatedDirectory - Owned output directory.
 * @returns Whether the destination stays inside that directory.
 */
function isInside(path: string, generatedDirectory: string): boolean {
  const rest = relative(resolve(generatedDirectory), resolve(path));
  return rest === "" || (!rest.startsWith("..") && !rest.startsWith("/"));
}

/**
 * Renders a native destination relative to the project for diagnostics.
 * @param path - Absolute native write destination.
 * @param projectRoot - Root removed from the display path.
 * @returns A portable relative diagnostic path, using dot for the root itself.
 */
function displayPath(path: string, projectRoot: string): string {
  const projectRelative = relative(resolve(projectRoot), resolve(path));
  return projectRelative === "" ? "." : projectRelative.replaceAll("\\", "/");
}
