import { Context, Effect, Schema } from "effect";
import { existsSync, readFileSync } from "node:fs";
import type { SourceReader } from "./source-map-source.types.js";
import { observeCompiler } from "../observability.js";

/** Expected native filesystem failure; mapping may recover by omitting syntax facts. */
export class SourceMapReadError extends Schema.TaggedError<SourceMapReadError>()(
  "SourceMapReadError",
  { path: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Explicit source access dependency, replaceable with supplied text or test readers.
 * @remarks Read failures use SourceMapReadError; source-reader defects propagate.
 * @see {@link mapSourceLocationsEffect} for checked service provisioning and execution.
 */
export class DiscoverySourceReader extends Context.Service<DiscoverySourceReader, SourceReader>()(
  "relkit/compiler/DiscoverySourceReader",
) {}

/** Node adapter provided by default discovery and normalization entrypoints. */
export const nodeSourceReader = DiscoverySourceReader.of({
  /** {@inheritDoc SourceReader.exists} */
  exists: Effect.fn("discovery.source.exists")(
    function* (path: string) {
      return existsSync(path);
    },
    (effect) =>
      observeCompiler("discovery", "sourceReaderExists", effect, () => ({ files: 1 }), false),
  ),

  /** {@inheritDoc SourceReader.read} */
  read: Effect.fn("discovery.source.read")(
    function* (path: string) {
      // Only native errno failures are expected. Programmer errors stay defects.
      try {
        return readFileSync(path, "utf8");
      } catch (cause) {
        if (isNativeFailure(cause))
          return yield* Effect.fail(new SourceMapReadError({ path, cause }));
        return yield* Effect.die(cause);
      }
    },
    (effect) =>
      observeCompiler("discovery", "sourceReaderRead", effect, () => ({ files: 1 }), false),
  ),
});

/**
 * Recognizes native filesystem errors without classifying arbitrary thrown values.
 * @param cause - Value thrown by the Node filesystem adapter.
 * @returns Whether the error has Node's native errno fields.
 */
function isNativeFailure(cause: unknown): cause is NodeJS.ErrnoException {
  return (
    cause instanceof Error &&
    "code" in cause &&
    typeof cause.code === "string" &&
    "errno" in cause &&
    typeof cause.errno === "number" &&
    "syscall" in cause &&
    typeof cause.syscall === "string"
  );
}
