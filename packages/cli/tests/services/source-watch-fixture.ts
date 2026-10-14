/** Supplies precise native watch/supervisor doubles whose callbacks retain original failures and joined cleanup observations. */
import { Deferred, Effect, Layer } from "effect";
import { CliSourceWatch } from "../../src/services/source-watch.service.js";
import { CliDevSupervisor } from "../../src/services/dev-supervisor.service.js";
import { CliPortProbe } from "../../src/commands/port-availability.service.js";
import { CliInspectorSupport } from "../../src/commands/dev-inspector-support.service.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { filesystemTestLayer } from "./test-layers.js";

/** Captures SDK-shaped callbacks without running an Effect runtime from native registration.
 * @param stopThrows - Whether the controlled native stop also fails.
 * @returns Native capability graph, callbacks and exact cleanup observations.
 */
export const sourceWatchFixture = Effect.fn("SourceWatchTest.fixture")(function* (
  stopThrows: boolean,
) {
  const stopped = yield* Deferred.make<void>();
  let fail: Parameters<CliSourceWatch["Service"]["watch"]>[3] | undefined;
  let change: Parameters<CliSourceWatch["Service"]["watch"]>[2] | undefined;
  const released: string[] = [];
  const native = Layer.succeed(
    CliSourceWatch,
    CliSourceWatch.of({
      watch: (_path, _recursive, onChange, failure) =>
        Effect.sync(() => {
          fail = failure;
          change = onChange;
          return () => {
            if (stopThrows) {
              released.push("watch");
              throw new Error("Native stop failed.");
            }
          };
        }),
      poll: (path) =>
        Effect.succeed(() => {
          if (stopThrows) released.push(path.endsWith(".env.local") ? "env.local" : "env");
        }),
    }),
  );
  return {
    graph: watchTestGraph(native, stopped),
    stopped,
    released,
    fail: (reason: Error) => fail?.(reason),
    change: (filename: string) => change?.(filename),
  };
});

/** Composes the controlled watcher graph without starting compiler or inspector resources.
 * @param native - Captured original watcher adapter shape.
 * @param stopped - Completion observed only when native shutdown is requested.
 * @returns Test Layer with explicit watcher, supervisor, cleanup and filesystem authority.
 */
function watchTestGraph(native: Layer.Layer<CliSourceWatch>, stopped: Deferred.Deferred<void>) {
  const forbidden = () => Effect.die(new Error("Unexpected candidate operation."));
  const sdk = Layer.succeed(
    CliDevSupervisor,
    CliDevSupervisor.of({
      start: forbidden,
      verify: forbidden,
      dispose: forbidden,
      drain: forbidden,
      listen: forbidden,
      stopProxy: () => Deferred.succeed(stopped, undefined).pipe(Effect.asVoid),
    }),
  );
  return Layer.mergeAll(
    native,
    sdk,
    filesystemTestLayer(),
    cleanupLayer,
    Layer.succeed(CliInspectorSupport, { run: () => Effect.never }),
    Layer.succeed(CliPortProbe, CliPortProbe.of({ check: forbidden })),
  );
}
