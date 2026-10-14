/** Exercises real inherited config witnesses with deterministic watcher registration and release. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  effectiveWatchConfigPaths,
  syncWatchConfigurations,
} from "../../src/commands/dev-watch-config.js";
import { makeDevWatchOwner } from "../../src/commands/dev-watch-owner.js";
import { DevSession } from "../../src/commands/dev-session.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";

const directory = Effect.acquireRelease(
  Effect.tryPromise(() => mkdtemp(join(tmpdir(), "relkit-watch-config-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

it.live(
  "captures effective aliases/extends and refreshes inherited registrations exactly once",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const ownerRoot = yield* directory;
        const root = join(ownerRoot, "application"),
          first = join(ownerRoot, "base.json"),
          second = join(ownerRoot, "other.json");
        yield* Effect.tryPromise(async () => {
          await mkdir(root);
          await writeFile(first, '{"compilerOptions":{"paths":{"@app/*":["src/*"]}}}');
          await writeFile(second, '{"compilerOptions":{"strict":true}}');
          await writeFile(join(root, "tsconfig.json"), '{"extends":"../base.json"}');
        });
        expect(yield* effectiveWatchConfigPaths(root)).toContain(first);
        const session = new DevSession({ projectRoot: root, installSignalHandlers: false });
        const owner = yield* makeDevWatchOwner(session);
        const releases: string[] = [];
        const watches = {
          watch: () => Effect.succeed(() => undefined),
          poll: (path: string) =>
            Effect.succeed(() => {
              releases.push(path);
            }),
        };
        yield* syncWatchConfigurations(root, watches, owner);
        expect(owner.state.configPaths.has("../base.json")).toBe(true);
        yield* Effect.tryPromise(() =>
          writeFile(join(root, "tsconfig.json"), '{"extends":"../other.json"}'),
        );
        yield* syncWatchConfigurations(root, watches, owner);
        expect(owner.state.configPaths.has("../base.json")).toBe(false);
        expect(owner.state.configPaths.has("../other.json")).toBe(true);
        expect(releases.filter((path) => path === first)).toHaveLength(1);
        yield* owner.closeEffect;
        expect(releases.filter((path) => path === first)).toHaveLength(1);
        expect(releases.filter((path) => path === second)).toHaveLength(1);
      }),
    ).pipe(Effect.provide(cleanupLayer)),
);
