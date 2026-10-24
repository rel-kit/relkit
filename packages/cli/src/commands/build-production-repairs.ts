/** Captures only selected release-owned repair bytes for portable production installs. */
import { Effect } from "effect";
import { readDrizzlePatch } from "create-relkit/internal/dependency-patches";
import { cliAdapterError } from "../cli-errors.js";

/** Exact release patch bytes copied into the same accepted production cohort. */
export interface ProductionRepairs {
  readonly patchedDependencies: Readonly<Record<string, string>>;
  readonly assets: readonly {
    readonly path: string;
    readonly content: string;
    readonly hash: string;
  }[];
}

/**
 * Reads the generator's verified canonical asset only for selected native Drizzle.
 * @param dependencies - Exact observed production dependencies.
 * @returns Byte-identical repair metadata or rejection before publishing a partial build.
 */
export const captureProductionRepairs = Effect.fn("Project.productionRepairs")(function* (
  dependencies: Readonly<Record<string, string>>,
): Effect.fn.Return<ProductionRepairs, import("../cli-errors.js").CliAdapterError> {
  const version = dependencies["drizzle-orm"];
  if (version === undefined) return { patchedDependencies: {}, assets: [] };
  const patch = yield* Effect.tryPromise({
    try: readDrizzlePatch,
    catch: (cause) => cliAdapterError("build.productionPatch", cause),
  });
  if (version !== patch.version)
    return yield* cliAdapterError(
      "build.productionPatch",
      new Error(`Selected drizzle-orm@${version} has no release-owned compatible repair.`),
    );
  return {
    patchedDependencies: { [patch.key]: patch.path },
    assets: [{ path: patch.path, content: patch.content, hash: patch.hash }],
  };
});
