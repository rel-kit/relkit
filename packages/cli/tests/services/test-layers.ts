import { Effect, Layer } from "effect";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliCompiler } from "../../src/services/compiler.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import type { FileSystemCapabilities } from "../../src/services/filesystem.types.js";
import type { CompilerCapabilities } from "../../src/services/compiler.types.js";

/**
 * Supplies filesystem behavior explicitly; an unlisted mutation fails the test as a defect.
 * @param overrides - Capabilities this test is authorized to invoke.
 * @returns A deterministic narrow filesystem Layer.
 */
export function filesystemTestLayer(overrides: Partial<FileSystemCapabilities> = {}) {
  const unavailable = () => Effect.die(new Error("Unexpected filesystem operation in test."));
  return Layer.succeed(
    CliFileSystem,
    CliFileSystem.of({
      readText: unavailable,
      writeText: unavailable,
      writeExclusive: unavailable,
      chmod: unavailable,
      mkdir: unavailable,
      remove: unavailable,
      copy: unavailable,
      rename: unavailable,
      stage: unavailable,
      symlink: unavailable,
      unlink: unavailable,
      stat: unavailable,
      exists: unavailable,
      files: unavailable,
      ...overrides,
    }),
  );
}

/**
 * Supplies only compiler operations declared by the test.
 * @param overrides - Exact compiler capability substitutes.
 * @returns A deterministic compiler Layer without native evaluation or output writes.
 */
export function compilerTestLayer(overrides: Partial<CompilerCapabilities> = {}) {
  const unavailable = () => Effect.die(new Error("Unexpected compiler operation in test."));
  return Layer.succeed(
    CliCompiler,
    CliCompiler.of({
      loadConfig: unavailable,
      evaluate: unavailable,
      typecheck: unavailable,
      integrationPackages: unavailable,
      integrationRole: unavailable,
      writeChanged: unavailable,
      writeArtifacts: unavailable,
      writeWorkers: unavailable,
      ...overrides,
    }),
  );
}

/** A module substitute that rejects accidental import authority in pure build tests. */
export const modulesTestLayer = Layer.succeed(
  CliModules,
  CliModules.of({
    load: () => Effect.die(new Error("Unexpected module import in test.")),
    invalidate: () => Effect.void,
  }),
);
