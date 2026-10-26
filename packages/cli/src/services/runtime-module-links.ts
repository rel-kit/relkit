/** Retains the selected HTTP producer in an owned runnable directory. Build/candidate rollback owns these links; deployment contexts exclude node_modules and install the production manifest instead. */
import { dirname, join } from "node:path";
import { Effect } from "effect";
import type { DependencySourceContract } from "@relkit/provider/internal/dependencies";
import { cliAdapterError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { resolveProductionDependency } from "./production-dependency-source.js";
import type { FileSystemCapabilities } from "./filesystem.types.js";

/**
 * Preserves the one framework runtime owner that can be installed only beneath the CLI.
 * @param files - Captured filesystem authority for the caller-owned output.
 * @param source - Installed package resolver with consumer-first producer fallback.
 * @param directory - Runnable server directory inside a fresh build or candidate.
 * @param projectRoot - Actual application dependency context.
 * @param external - Selected external packages; unselected HTTP transports create no link.
 * @returns Completion or typed resolution/link failure before the generation can start.
 */
export const linkRuntimeModules = Effect.fn("Project.runtimeModuleLinks")(
  function* (
    files: FileSystemCapabilities,
    source: DependencySourceContract,
    directory: string,
    projectRoot: string,
    external: readonly string[],
  ) {
    const name = "@relkit/runtime-hono";
    if (!external.includes(name)) return;
    const identity = yield* resolveProductionDependency(source, name, projectRoot).pipe(
      Effect.mapError((cause) => cliAdapterError("runtime.moduleLink.resolve", cause)),
    );
    if (identity === null)
      return yield* cliAdapterError(
        "runtime.moduleLink.resolve",
        new Error(`Runtime owner ${name} is missing.`),
      );
    const target = join(directory, "node_modules", name);
    yield* files.mkdir(dirname(target));
    yield* files.symlink(identity.root, target);
  },
  (effect) => observeCli("runtime.moduleLinks", effect),
);
