import { watch, watchFile, unwatchFile, type Stats } from "node:fs";
import { Context, Effect, Layer } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { SourceWatchOperations } from "./source-watch.types.js";

/** Explicit native file-watcher authority, replaceable without real watcher races. */
export class CliSourceWatch extends Context.Service<CliSourceWatch, SourceWatchOperations>()(
  "relkit/cli/SourceWatch",
) {}

/**
 * Supplies individual native watch acquisitions; their owner registers every returned stop.
 * @returns A lazy Layer without opening watchers during acquisition.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
 *   const watches = yield* CliSourceWatch;
 *   yield* Effect.acquireRelease(watches.watch("./src", true, () => undefined, () => undefined),
 *     (stop) => Effect.sync(stop));
 * })).pipe(Effect.provide(sourceWatchLayer)));
 * ```
 */
export const sourceWatchLayer = Layer.succeed(
  CliSourceWatch,
  CliSourceWatch.of({
    watch: Effect.fn("CliSourceWatch.watch")((path, recursive, change, failure) =>
      observeCli(
        "dev.watch.subscribe",
        cliTry("dev.watch.subscribe", () => {
          const owner = watch(path, { recursive }, (_event, filename) => {
            if (filename !== null) change(filename.toString());
          });
          owner.on("error", failure);
          return () => {
            owner.removeListener("error", failure);
            owner.close();
          };
        }),
      ),
    ),
    poll: Effect.fn("CliSourceWatch.poll")((path, change) =>
      observeCli(
        "dev.watch.poll",
        cliTry("dev.watch.poll", () => {
          const listener = (current: Stats, previous: Stats) => {
            if (current.mtimeMs !== previous.mtimeMs || current.ctimeMs !== previous.ctimeMs)
              change();
          };
          watchFile(path, { interval: 100 }, listener);
          return () => unwatchFile(path, listener);
        }),
      ),
    ),
  }),
);
