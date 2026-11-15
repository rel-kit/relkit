/**
 * A file event makes the development watcher rebuild only when the file's content differs from
 * what the last decision saw. Cloning a project folder reports its source files without changing
 * them; deletions, new files and edits still count.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { makeDevSourceWatcherEffect } from "../../src/commands/dev-watch.js";
import type { DevSession } from "../../src/commands/dev-session.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliSourceWatch, sourceWatchLayer } from "../../src/services/source-watch.service.js";

const tempRoots: string[] = [];
let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-watch-content-"));
  tempRoots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n");
  await writeFile(join(root, "src", "b.ts"), "export const b = 1;\n");
});

afterEach(async () => {
  for (const directory of tempRoots.splice(0))
    await rm(directory, { recursive: true, force: true });
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A session whose activations are recorded; the watcher batches its events after 75 ms. */
function recordingSession(projectRoot: string, batches: (readonly string[])[]): DevSession {
  return {
    projectRoot,
    options: {},
    nativeEngine: {
      activate: (_version: number | undefined, files: readonly string[]) =>
        Effect.sync(() => {
          batches.push(files);
          return true;
        }),
      requestStop: () => undefined,
    },
  } as unknown as DevSession;
}

/** Runs the watcher over `native` while `script` feeds it events; returns the recorded batches. */
async function watched(
  native: Layer.Layer<CliSourceWatch>,
  batches: (readonly string[])[],
  script: () => Promise<void>,
): Promise<void> {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* makeDevSourceWatcherEffect(recordingSession(root, batches));
        yield* Effect.promise(script);
      }),
    ).pipe(Effect.provide(Layer.merge(native, cleanupLayer))),
  );
}

/** A watcher whose events the test sends by hand, one `src` filename at a time. */
function fakeWatch() {
  let send: (filename: string) => void = () => undefined;
  const layer = Layer.succeed(
    CliSourceWatch,
    CliSourceWatch.of({
      watch: (path, _recursive, change) =>
        Effect.sync(() => {
          if (path.endsWith("src")) send = change;
          return () => undefined;
        }),
      poll: () => Effect.succeed(() => undefined),
    }),
  );
  return { layer, emit: (...files: string[]) => files.forEach((file) => send(file)) };
}

describe("a file event without a content change", () => {
  test("does not rebuild; edits, deletions and new files do", async () => {
    const fake = fakeWatch();
    const batches: (readonly string[])[] = [];
    await watched(fake.layer, batches, async () => {
      // The event stream repeats files whose content did not change, as a clone of the folder does.
      fake.emit("a.ts", "b.ts", "a.ts");
      await pause(300);
      // Same bytes, newer modification time: a touch or a save without an edit.
      const later = new Date(Date.now() + 60_000);
      await utimes(join(root, "src", "b.ts"), later, later);
      fake.emit("b.ts");
      await pause(300);
      expect(batches).toEqual([]);

      await writeFile(join(root, "src", "a.ts"), "export const a = 2;\n");
      fake.emit("a.ts");
      await pause(300);
      expect(batches).toEqual([["src/a.ts"]]);

      // The edited content is now what the last decision saw.
      fake.emit("a.ts");
      await pause(300);
      expect(batches).toHaveLength(1);

      await rm(join(root, "src", "b.ts"));
      await writeFile(join(root, "src", "c.ts"), "export const c = 1;\n");
      fake.emit("b.ts", "c.ts");
      await pause(300);
      expect(batches).toEqual([["src/a.ts"], ["src/b.ts", "src/c.ts"]]);

      // A file the watcher never saw counts, even when it is already gone again.
      fake.emit("temporary.ts~");
      await pause(300);
      expect(batches.at(-1)).toEqual(["src/temporary.ts~"]);
    });
    expect(batches).toHaveLength(3);
  });

  // `cp -c -R` makes an APFS clone; the file-system events carry a "cloned" flag for the sources.
  test.skipIf(process.platform !== "darwin")(
    "a real APFS clone of the project does not rebuild the running watcher",
    async () => {
      await mkdir(join(root, "src", "routes"));
      for (let index = 0; index < 40; index += 1)
        await writeFile(
          join(root, "src", "routes", `r${index}.ts`),
          `export const r = ${index};\n`,
        );
      await pause(200);
      const batches: (readonly string[])[] = [];
      await watched(sourceWatchLayer, batches, async () => {
        await pause(300);
        execFileSync("cp", ["-c", "-R", root, `${root}-copy`]);
        tempRoots.push(`${root}-copy`);
        await pause(1500);
      });
      expect(batches).toEqual([]);
    },
    20_000,
  );
});
