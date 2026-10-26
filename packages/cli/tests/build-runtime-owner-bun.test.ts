/** Runs real bundles from an isolated consumer whose HTTP owner is reachable only through the CLI. */
import { expect, test } from "bun:test";
import { lstat, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { createBuildSupportFixture, runFixtureBun } from "../build-support-fixture.js";
import { processLayer } from "../src/services/process.service.js";
import { ownedNativePromise } from "../src/services/owned-promise.js";

for (const development of [false, true]) {
  test(`isolated HTTP owner survives ${development ? "development" : "production"} publication`, () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* createBuildSupportFixture();
          yield* ownedNativePromise("test.httpSource", () =>
            writeFile(join(fixture.server, "index.ts"), source),
          );
          const helper = join(fixture.root, "cli/src");
          const built = yield* runFixtureBun(
            ["--eval", bundleSource(helper, fixture.server, fixture.root, development)],
            fixture.modules,
          );
          expect(built.exitCode, built.stdout + built.stderr).toBe(0);
          const activated = join(fixture.root, "activated");
          yield* ownedNativePromise("test.activate", () => rename(fixture.server, activated));
          const started = yield* runFixtureBun(
            ["--no-install", join(activated, "index.js")],
            fixture.root,
          );
          expect(started.exitCode, started.stdout + started.stderr).toBe(0);
          expect(started.stdout.split("\n")[0]).toBe('["mcp","ag-ui","scalar"]');
          yield* ownedNativePromise("test.runtimeLinks", async () => {
            expect(await readdir(join(activated, "node_modules/@relkit"))).toEqual([
              "runtime-hono",
            ]);
            expect(
              (await lstat(join(activated, "node_modules/@relkit/runtime-hono"))).isSymbolicLink(),
            ).toBe(true);
          });
        }),
      ).pipe(Effect.provide(processLayer)),
    ));
}

const source = `import { selectedHttpCapabilities } from "@relkit/runtime-hono/internal/prepared";
console.log(JSON.stringify(selectedHttpCapabilities({mcp:{enabled:true},agUi:true,apiDocs:{ui:"scalar",mode:"production",enabledInProduction:true}})));
console.log(import.meta.resolve("@relkit/runtime-hono/mcp"));
console.log(import.meta.resolve("@relkit/runtime-hono/ag-ui"));
console.log(import.meta.resolve("@relkit/runtime-hono/scalar"));
`;

/** Runs the copied production bundler with the real selected external owner.
 * @param helper - Isolated CLI source root. @param server - Owned stage.
 * @param root - Consumer without hoisted framework packages. @param development - Build mode.
 * @returns Native Bun script with only fixture-owned paths.
 */
function bundleSource(helper: string, server: string, root: string, development: boolean): string {
  return `import { Effect, Layer } from "effect";
import { DependencySourceLive } from "@relkit/provider/internal/dependencies";
import { bundleServerEffect } from ${JSON.stringify(join(helper, "commands/build-support.ts"))};
import { fileSystemLayer } from ${JSON.stringify(join(helper, "services/filesystem.service.ts"))};
import { processLayer } from ${JSON.stringify(join(helper, "services/process.service.ts"))};
import { cleanupLayer } from ${JSON.stringify(join(helper, "services/cleanup.service.ts"))};
await Effect.runPromise(bundleServerEffect(${JSON.stringify(server)}, ${JSON.stringify(root)}, ${development}, undefined, ["@relkit/runtime-hono"]).pipe(Effect.provide(Layer.mergeAll(fileSystemLayer, processLayer, cleanupLayer, DependencySourceLive))));`;
}
