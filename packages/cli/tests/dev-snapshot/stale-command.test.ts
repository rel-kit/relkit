/** Verifies stale authored bytes cannot start a prepared session or create its owned directory. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { seedStaleCommandFixture } from "./stale-command-fixture.js";

const execute = promisify(execFile);

it.live("rejects a stale source before creating any prepared session directory", () =>
  Effect.acquireUseRelease(
    Effect.tryPromise(() => mkdtemp(join(tmpdir(), "relkit-stale-command-"))),
    (root) =>
      Effect.gen(function* () {
        yield* seedStaleCommandFixture(root);
        const command = fileURLToPath(
          new URL("../../src/dev-snapshot/snapshot-command.ts", import.meta.url),
        );
        const script = `const { runPreparedDev } = await import(${JSON.stringify(command)}); console.log(await runPreparedDev(["--project-root", ${JSON.stringify(root)}], new AbortController().signal));`;
        const output = yield* Effect.tryPromise({
          try: (signal) => execute("bun", ["-e", script], { signal, timeout: 15000 }),
          catch: (cause) =>
            cause instanceof Error ? cause : new Error("Prepared command probe failed", { cause }),
        });
        expect(output.stdout.trim()).toBe("false");
        expect(existsSync(join(root, ".relkit/dev/sessions"))).toBe(false);
      }),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  ),
);
