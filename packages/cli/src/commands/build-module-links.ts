/** Gives generated imports explicit framework and selected consumer module roots. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { DependencySource } from "@relkit/provider/internal/dependencies";
import { cliAdapterError } from "../cli-errors.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import type { FileSystemCapabilities } from "../services/filesystem.types.js";

/** These packages are fixed imports emitted by the framework server producer. */
const FRAMEWORK_PACKAGES = [
  "effect",
  "@relkit/agents",
  "@relkit/app",
  "@relkit/config",
  "@relkit/contracts",
  "@relkit/engine",
  "@relkit/graph",
  "@relkit/inspector-api",
  "@relkit/invocation",
  "@relkit/jobs",
  "@relkit/local-service",
  "@relkit/observability",
  "@relkit/provider",
  "@relkit/realtime",
  "@relkit/runtime-effect",
  "@relkit/runtime-hono",
] as const;

/**
 * Links fixed framework dependencies only; external integrations use native consumer resolution.
 * @param files - Build-owned filesystem capabilities.
 * @param directory - Owned stage's module directory.
 * @param projectRoot - Actual consuming application root.
 * @returns A scope-owned directory removed after the bundler physically settles.
 */
export const linkBuildModules = Effect.fn("Project.buildModuleLinks")(function* (
  files: FileSystemCapabilities,
  directory: string,
  projectRoot: string,
) {
  const source = yield* DependencySource;
  yield* Effect.acquireRelease(files.mkdir(directory), () =>
    cleanupEffect("build.moduleLink.remove", files.remove(directory)),
  );
  const producer = dirname(fileURLToPath(import.meta.url));
  for (const name of FRAMEWORK_PACKAGES) {
    const identity =
      (yield* source
        .resolve(name, projectRoot)
        .pipe(Effect.mapError((cause) => cliAdapterError("build.frameworkDependency", cause)))) ??
      (yield* source
        .resolve(name, producer)
        .pipe(Effect.mapError((cause) => cliAdapterError("build.frameworkDependency", cause))));
    if (identity === null)
      return yield* cliAdapterError(
        "build.frameworkDependency",
        new Error(`Build producer dependency ${name} is missing.`),
      );
    yield* files.mkdir(dirname(join(directory, name)));
    yield* files.symlink(identity.root, join(directory, name));
  }
});
