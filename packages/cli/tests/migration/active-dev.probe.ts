/** Verifies known native development ownership across macOS lexical/canonical temporary roots. */
import assert from "node:assert/strict";
import { writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { Cause, Effect, Exit, Scope } from "effect";
import { assertNoActiveLayoutDev } from "../../src/migration/layout-active-dev.js";
import { CliProcess, processLayer } from "../../src/services/process.service.js";
import { migrationFixture } from "./fixture.js";
import { runLayoutProbe } from "./probe-runner.js";

/**
 * Waits for the native child to prove it is running from the fixture directory.
 * @param marker - Child-owned readiness file.
 * @returns Completion after the native write, or an assertion timeout.
 */
const ready = Effect.fn("test.migration.dev.ready")(function* (marker: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const found = yield* Effect.tryPromise(() => access(marker)).pipe(
      Effect.match({
        onFailure: () => false,
        onSuccess: () => true,
      }),
    );
    if (found) return;
    yield* Effect.sleep("20 millis");
  }
  throw new Error("Native development marker did not become ready");
});

await runLayoutProbe(
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* migrationFixture;
      const script = join(root, ".relkit/relkit");
      const marker = join(root, ".relkit/active.ready");
      yield* Effect.promise(() =>
        writeFile(
          script,
          'await Bun.write(".relkit/active.ready", "ready"); await Bun.sleep(120000);',
        ),
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          const processes = yield* CliProcess;
          yield* processes
            .run({ command: process.execPath, args: [script, "dev"], cwd: root })
            .pipe(Effect.forkIn(yield* Scope.Scope));
          yield* ready(marker);
          const result = yield* Effect.exit(assertNoActiveLayoutDev(root));
          assert(Exit.isFailure(result));
          if (Exit.isFailure(result))
            assert.match(String(Cause.squash(result.cause)), /Stop development process/);
        }),
      );
      yield* assertNoActiveLayoutDev(root);
    }),
  ).pipe(Effect.provide(processLayer)),
);
console.log("RELKIT_LAYOUT_ACTIVE_DEV_OK");
