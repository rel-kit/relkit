/**
 * Reads manifest bytes, canonical paths and allocated file sizes for the external
 * consumer collector. Each finite native call settles before interruption; no
 * package code runs and symlink targets outside the consumer are rejected.
 */
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative } from "node:path";
import { Data, Effect, Schema } from "effect";
import { ConsumerManifest } from "./consumer-installation.schemas.js";
import type { PackageSize } from "./consumer-installation.types.js";

/** Operational collection failure with the original native diagnostic retained. */
export class ConsumerInspectionError extends Data.TaggedError("ConsumerInspectionError")<{
  /** Fixed collector stage used to identify the failed measurement. */
  readonly operation: string;
  /** Safe stage description for command-line reporting. */
  readonly message: string;
  /** Original foreign failure wrapped for Error.cause inspection; never raw-logged. */
  readonly cause: Error;
}> {}

/**
 * Constructs a typed invalid-input/artifact failure before native work begins.
 * @param operation - Stable collector stage that rejected the input.
 * @param message - Safe actionable explanation containing no credentials.
 * @returns Expected collector failure with a normalized diagnostic cause.
 */
export function consumerInputFailure(operation: string, message: string): ConsumerInspectionError {
  return new ConsumerInspectionError({ operation, message, cause: new Error(message) });
}

/**
 * Adapts one finite filesystem operation and joins its native settlement.
 * @typeParam A - Exact native return value.
 * @param operation - Bounded diagnostic stage.
 * @param run - Lazy finite native call.
 * @returns Its lazy result or a cause-preserving collection failure.
 */
export function inspectionNative<A>(operation: string, run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new ConsumerInspectionError({
        operation,
        message: `Consumer inspection failed: ${operation}`,
        cause: new Error(`Consumer inspection failed: ${operation}`, { cause }),
      }),
  }).pipe(Effect.uninterruptible);
}

/**
 * Reads package metadata without importing its executable entrypoint.
 * @param directory - Physical package root.
 * @returns Decoded dependency declarations or an actionable read/decode failure.
 */
export const readConsumerManifest = Effect.fn("ConsumerInstallation.manifest")(function* (
  directory: string,
) {
  const text = yield* inspectionNative("manifest.read", () =>
    readFile(join(directory, "package.json"), "utf8"),
  );
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ConsumerManifest))(text);
});

/**
 * Resolves a package from its actual importer's native search paths.
 * @param root - Canonical external consumer root.
 * @param directory - Consumer or selected adapter context.
 * @param name - Declared package name.
 * @returns Its contained physical directory or undefined when absent.
 */
export const resolveConsumerPackage = Effect.fn("ConsumerInstallation.resolve")(function* (
  root: string,
  directory: string,
  name: string,
) {
  const require = createRequire(join(directory, "package.json"));
  // Bun aliases ws to a built-in; declared installed metadata still needs native search paths.
  const search = require.resolve.paths(name) ?? require.resolve.paths(`${name}/package.json`) ?? [];
  for (const base of search) {
    const candidate = join(base, name);
    const location = yield* inspectionNative("package.resolve", () =>
      realpath(candidate).catch((cause) => {
        if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
        throw cause;
      }),
    );
    if (location === undefined) continue;
    const child = relative(root, location);
    if (child === ".." || child.startsWith("../") || isAbsolute(child))
      return yield* new ConsumerInspectionError({
        operation: "package.containment",
        message: `Dependency resolves outside consumer: ${name}`,
        cause: new Error(`Dependency resolves outside consumer: ${name}`),
      });
    return location;
  }
  return undefined;
});

/**
 * Measures one package's own files without following nested package symlinks.
 * @param directory - Canonical installed package root.
 * @param allocated - Shared device/inode identities already attributed in this closure.
 * @returns Logical/allocated bytes and exact native binary paths.
 */
export const measurePackage = Effect.fn("ConsumerInstallation.measure")(function* (
  directory: string,
  allocated = new Set<string>(),
) {
  let logicalBytes = 0,
    physicalBytes = 0;
  const nativeFiles: string[] = [],
    pending = [directory];
  for (const current of pending) {
    const entries = yield* inspectionNative("package.entries", () =>
      readdir(current, { withFileTypes: true }),
    );
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = yield* inspectionNative("package.stat", () => lstat(path));
      logicalBytes += info.size;
      const identity = `${info.dev}:${info.ino}`;
      if (!allocated.has(identity)) physicalBytes += info.blocks * 512;
      allocated.add(identity);
      if (/\.(?:node|dylib|so|dll)$/.test(path)) nativeFiles.push(path);
    }
  }
  return { logicalBytes, physicalBytes, nativeFiles: nativeFiles.sort() } satisfies PackageSize;
});
