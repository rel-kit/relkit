/** Watches effective TypeScript option inputs, including inherited/aliased configuration changes. */
import { dirname, join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { SourceWatchOperations } from "../services/source-watch.types.js";
import type { DevWatchOwner } from "./dev-watch-owner.types.js";

/**
 * Resolves configuration witnesses without building a TypeScript program or importing sources.
 * @param root - Canonical project root.
 * @returns Paths read by effective option parsing; root creation/deletion is watched even absent.
 */
export const effectiveWatchConfigPaths = Effect.fn("Dev.watchConfigPaths")(
  (root: string) =>
    cliTry("dev.watch.config", () => {
      const path = join(root, "tsconfig.json"),
        files = new Set([path]);
      const readFile = (file: string): string | undefined => {
        files.add(resolve(file));
        return ts.sys.readFile(file);
      };
      if (ts.sys.fileExists(path)) {
        const config = ts.readConfigFile(path, readFile);
        if (!config.error)
          ts.parseJsonConfigFileContent(config.config, { ...ts.sys, readFile }, root, {}, path);
      }
      return [...files].sort();
    }),
  (effect) => observeCli("dev.watch.config-inputs", effect),
);

/**
 * Updates native config polling after each admitted batch before compiler invalidation.
 * @param root - Authored project root.
 * @param native - Captured native watcher capability.
 * @param owner - Invocation-owned registration and queue authority.
 * @returns Joined new registrations; removed witnesses no longer admit stale changes.
 */
export const syncWatchConfigurations = Effect.fn("Dev.syncWatchConfigurations")(function* (
  root: string,
  native: SourceWatchOperations,
  owner: DevWatchOwner,
) {
  const paths = yield* effectiveWatchConfigPaths(root);
  owner.state.configPaths.clear();
  for (const path of paths) owner.state.configPaths.add(relative(root, path).replaceAll("\\", "/"));
  const polled = paths.filter(
    (path) => dirname(path) !== root && !path.startsWith(join(root, "src") + "/"),
  );
  for (const [path, stop] of owner.state.configStops) {
    if (!polled.includes(path)) {
      yield* cliTry("dev.watch.config.release", stop);
      owner.state.configStops.delete(path);
    }
  }
  for (const path of polled) {
    if (owner.state.configStops.has(path)) continue;
    const stop = yield* owner.register(
      native.poll(path, () => owner.notify([relative(root, path).replaceAll("\\", "/")])),
    );
    owner.state.configStops.set(path, stop);
  }
});
