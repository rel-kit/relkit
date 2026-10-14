/** Owns the CLI's original native source/root/dotenv watcher adapters and bounded callback admission during source mutation acceptance. */
import { join } from "node:path";
import { Effect, Queue } from "effect";
import { CliSourceWatch } from "../../../packages/cli/src/services/source-watch.service.js";
import { ignoredWatchPath } from "../../../packages/cli/src/commands/dev-watch-paths.js";

/** Acquires original native watchers without creating a separate runtime inside their callbacks.
 * @param root - Exclusive source root retained until every watcher closes.
 * @returns Bounded native observations and joined registration cleanup under the caller Scope.
 */
export const layoutDevelopmentWatch = Effect.fn("LayoutDevelopment.watch")(function* (
  root: string,
) {
  const native = yield* CliSourceWatch;
  const events = yield* Queue.make<string | Error>({ capacity: 256, strategy: "sliding" });
  const change = (file: string) => {
    if (!ignoredWatchPath(file)) Queue.offerUnsafe(events, file);
  };
  const failure: Parameters<CliSourceWatch["Service"]["watch"]>[3] = (cause) => {
    Queue.offerUnsafe(
      events,
      cause instanceof Error ? cause : new Error("Native source watcher failed", { cause }),
    );
  };
  yield* registerDevelopmentDirectories(root, native, change, failure);
  for (const file of [".env", ".env.local"]) {
    yield* Effect.acquireRelease(
      native.poll(join(root, file), () => change(file)),
      (stop) => Effect.sync(stop),
    );
  }
  return {
    clear: Queue.takeBetween(events, 0, 256).pipe(Effect.asVoid),
    changed: Queue.take(events).pipe(
      Effect.flatMap((event) =>
        event instanceof Error ? Effect.fail(event) : Effect.succeed(event),
      ),
      Effect.timeout("5 seconds"),
    ),
  };
});

/** Installs the original native source/root registrations under the same caller Scope.
 * @param root - Owned project input root.
 * @param native - Original CLI watcher capability.
 * @param change - Bounded native event admission, without nested Effect execution.
 * @param failure - Original SDK-shaped failure callback retaining its cause.
 * @returns Scoped registrations; every native stop runs before the project root releases.
 */
const registerDevelopmentDirectories = Effect.fn("LayoutDevelopment.directories")(function* (
  root: string,
  native: CliSourceWatch["Service"],
  change: (file: string) => void,
  failure: Parameters<CliSourceWatch["Service"]["watch"]>[3],
) {
  for (const [path, recursive, prefix] of [
    [join(root, "src"), true, "src/"],
    [root, false, ""],
  ] as const) {
    yield* Effect.acquireRelease(
      native.watch(
        path,
        recursive,
        (file) => {
          if (
            prefix !== "" ||
            [
              "relkit.config.ts",
              "package.json",
              "bun.lock",
              "tsconfig.json",
              "tsconfig.layout-base.json",
            ].includes(file)
          )
            change(prefix + file.replaceAll("\\", "/"));
        },
        failure,
      ),
      (stop) => Effect.sync(stop),
    );
  }
});
