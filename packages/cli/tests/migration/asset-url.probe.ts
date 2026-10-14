/** Reads an original native function's platform asset before migration, after publication and after rollback. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
  LayoutMigration,
  layoutMigrationLayer,
} from "../../src/migration/layout-migration.service.js";
import { CliProcess, processLayer } from "../../src/services/process.service.js";
import { runLayoutProbe } from "./probe-runner.js";
import { migrationFixture } from "./fixture.js";

/** Invokes the original descriptor through the native engine rather than inspecting rewritten text.
 * @param root - Owned migration application.
 * @param serviceRoot - Current physical service location.
 * @returns Joined native output containing the actual platform asset. */
const invokeAsset = Effect.fn("test.migration.asset")(function* (
  root: string,
  serviceRoot: string,
) {
  const result = yield* (yield* CliProcess).run({
    command: "bun",
    args: [
      "-e",
      `import { invokeFunction } from "@relkit/engine";
      import target from "./${serviceRoot}/functions/hello.function.ts";
      console.log(await invokeFunction(target, {}));`,
    ],
    cwd: root,
  });
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  assert(result.stdout.includes("platform-asset-sentinel"), result.stdout);
});

await runLayoutProbe(
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* migrationFixture;
      yield* Effect.tryPromise(async () => {
        await mkdir(join(root, "src/platform"), { recursive: true });
        await writeFile(join(root, "src/platform/message.txt"), "platform-asset-sentinel");
        const file = join(root, "src/hello/functions/hello.function.ts");
        const source = await readFile(file, "utf8");
        await writeFile(
          file,
          source.replace(
            'handler: async () => "hello"',
            'handler: async () => Bun.file(new URL("../../platform/message.txt", import.meta.url)).text()',
          ),
        );
      });
      yield* invokeAsset(root, "src/hello");
      const migration = yield* LayoutMigration;
      const result = yield* migration.write(root);
      assert.equal(result.status, "committed");
      yield* invokeAsset(root, "src/services/hello");
      if (result.receipt === undefined) throw new Error("Missing recovery receipt");
      yield* migration.rollback(root, result.receipt);
      yield* invokeAsset(root, "src/hello");
    }),
  ).pipe(Effect.provide(layoutMigrationLayer), Effect.provide(processLayer)),
);
console.log("RELKIT_LAYOUT_ASSET_URL_OK");
