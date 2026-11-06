/** The project tree watch never descends into node_modules; Bun's Linux watcher holds a descriptor per directory. */
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { watchProjectTreeEffect } from "../../src/commands/dev-watch-tree.js";
import type { SourceWatchOperations } from "../../src/services/source-watch.types.js";

function recorder() {
  const opened: { path: string; recursive: boolean }[] = [];
  const changes: ((filename: string) => void)[] = [];
  let closed = 0;
  const watches: SourceWatchOperations = {
    watch: (path, recursive, change) =>
      Effect.sync(() => {
        opened.push({ path, recursive });
        changes.push(change);
        return () => {
          closed += 1;
        };
      }),
    poll: () => Effect.succeed(() => undefined),
  };
  return { watches, opened, changes, closed: () => closed };
}

test("watches the root shallowly and each source directory recursively, skipping dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-watch-tree-"));
  try {
    for (const directory of [
      "node_modules/effect",
      "src/routes",
      "tests",
      ".git",
      ".relkit",
      "dist",
    ])
      await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, "relkit.config.ts"), "");
    const { watches, opened, changes, closed } = recorder();
    const seen: string[] = [];
    const stop = await Effect.runPromise(
      watchProjectTreeEffect(
        watches,
        root,
        (file) => seen.push(file),
        () => undefined,
      ),
    );
    expect(opened).toEqual([
      { path: root, recursive: false },
      { path: join(root, "src"), recursive: true },
      { path: join(root, "tests"), recursive: true },
    ]);
    changes[0]!("relkit.config.ts");
    changes[1]!("routes/orders.ts");
    expect(seen).toEqual(["relkit.config.ts", "src/routes/orders.ts"]);
    stop();
    expect(closed()).toBe(3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a root that cannot be listed falls back to one recursive watch", async () => {
  const { watches, opened } = recorder();
  await Effect.runPromise(
    watchProjectTreeEffect(
      watches,
      "/relkit-missing-root",
      () => undefined,
      () => undefined,
    ),
  );
  expect(opened).toEqual([{ path: "/relkit-missing-root", recursive: true }]);
});
