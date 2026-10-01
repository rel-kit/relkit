import { normalizeSourcePathEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { resolve } from "node:path";
import type * as Mapping from "./source-map.types.js";
import type { ParsedSource } from "./source-map-utils.types.js";

/**
 * Creates run-local supplied-text and parse indexes.
 * @param options - Project root and supplemental sources.
 * @returns A lazy effect yielding the exclusively owned mapping context.
 * @remarks Invalid supplemental paths are omitted; text getter defects propagate.
 * @see {@link mapSourceLocationsEffect} for the owning source-map workflow.
 */
export const createContextEffect = Effect.fn("discovery.source.context")(function* (
  options: Mapping.SourceMapOptions,
) {
  const root = resolve(options.projectRoot ?? process.cwd());
  const texts = new Map<string, string>();
  yield* Effect.forEach(
    options.sources ?? [],
    (source) =>
      Effect.gen(function* () {
        const file = yield* normalizeSourcePathEffect(source.fileName, root).pipe(
          Effect.catchTag("SourceLocationError", () => Effect.succeed(undefined)),
        );
        if (file !== undefined) texts.set(file, source.text);
      }),
    { discard: true },
  );
  return {
    root,
    texts,
    parsed: new Map<string, ParsedSource | undefined>(),
  } satisfies Mapping.MapContext;
});
