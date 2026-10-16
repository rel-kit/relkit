/** Owns recursive source watching, effective config witnesses and a joined debounced activation worker. */
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliSourceWatch } from "../services/source-watch.service.js";
import { makeDevWatchOwner } from "./dev-watch-owner.js";
import { syncWatchConfigurations } from "./dev-watch-config.js";
import { startWatchWorker } from "./dev-watch-worker.js";
import { ignoredWatchPath } from "./dev-watch-paths.js";
import { developmentEnvironmentFiles } from "./dev-environment-files.js";
import type { DevSession } from "./dev-session.js";
import type { EffectDevSourceWatcher, DevSourceWatcher } from "./dev-watch.types.js";
export type { DevSourceWatcher } from "./dev-watch.types.js";

/**
 * Owns native watching and bounded source/config admission for either service layout.
 * @param session - Session-local activator and generation lifetime.
 * @returns Scoped watcher; callbacks only enqueue events or request supervised shutdown.
 */
export const makeDevSourceWatcherEffect = Effect.fn("Dev.watch")(
  function* (session: DevSession) {
    const native = yield* CliSourceWatch;
    const owner = yield* makeDevWatchOwner(session);
    const root = session.projectRoot;
    const sourceRoot = yield* cliTry("dev.watch.root", () =>
      existsSync(join(root, "src")) ? join(root, "src") : root,
    );
    yield* syncWatchConfigurations(root, native, owner);
    yield* owner.register(
      native.watch(
        sourceRoot,
        true,
        (filename) => {
          const file = relative(root, join(sourceRoot, filename)).replaceAll("\\", "/");
          if (!ignoredWatchPath(file) && file !== relative(root, sourceRoot)) owner.notify([file]);
        },
        owner.failure,
      ),
    );
    if (sourceRoot !== root)
      yield* owner.register(
        native.watch(
          root,
          false,
          (filename) => {
            if (
              ["relkit.config.ts", "package.json", "bun.lock", "tsconfig.json"].includes(
                filename,
              ) ||
              owner.state.configPaths.has(filename)
            )
              owner.notify([filename]);
          },
          owner.failure,
        ),
      );
    for (const file of developmentEnvironmentFiles(process.env.NODE_ENV))
      yield* owner.register(native.poll(join(root, file), () => owner.notify([file])));
    yield* startWatchWorker(session, native, owner);
    return { close: owner.close, closeEffect: owner.closeEffect } satisfies EffectDevSourceWatcher;
  },
  (effect) => observeCli("dev.watch.start", effect),
);

/**
 * Acquires watching through the manual owner's retained synchronous edge.
 * @param session - Started manual session.
 * @returns Existing synchronous admission-close facade.
 */
export function startDevSourceWatcher(session: DevSession): DevSourceWatcher {
  return session.runSynchronous(
    session.nativeEngine.watchWith(makeDevSourceWatcherEffect(session)),
  );
}
