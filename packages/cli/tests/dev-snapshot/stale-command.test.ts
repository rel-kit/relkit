/** Verifies stale authored bytes cannot start a prepared session or create its owned directory. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

it.live("rejects a different generation before reusing a preflight input watch", () =>
  Effect.acquireUseRelease(
    Effect.tryPromise(() => mkdtemp(join(tmpdir(), "relkit-preflight-generation-"))),
    (root) =>
      Effect.gen(function* () {
        yield* seedStaleCommandFixture(root);
        yield* Effect.tryPromise(() => writeFile(join(root, "src/app.ts"), "source"));
        const command = fileURLToPath(
          new URL("../../src/dev-snapshot/snapshot-command.ts", import.meta.url),
        );
        const script = `
        const { runPreparedDev } = await import(${JSON.stringify(command)});
        const root = ${JSON.stringify(root)};
        const { Effect, Layer } = await import("effect");
        const { DevSnapshots, devSnapshotsLive } = await import(${JSON.stringify(fileURLToPath(new URL("../../src/dev-snapshot/snapshot.service.ts", import.meta.url)))});
        const { snapshotFilesLive } = await import(${JSON.stringify(fileURLToPath(new URL("../../src/dev-snapshot/snapshot-files.service.ts", import.meta.url)))});
        const pointer = await Bun.file(root + "/.relkit/dev/current.json").json();
        const receipt = await Bun.file(root + "/.relkit/dev/generations/" + pointer.generation.slice(7) + "/receipt.json").json();
        // Establish that this cohort is valid before varying only the preflight generation.
        await Effect.runPromise(Effect.scoped(DevSnapshots.use(service => service.validate(root, receipt.tools))).pipe(
          Effect.provide(devSnapshotsLive.pipe(Layer.provide(snapshotFilesLive)))
        ));
        const epoch = { root, revision: 0, failure: undefined, notify: undefined, close() {} };
        console.log(await runPreparedDev(["--project-root", root], new AbortController().signal, {
          root, generation: "sha256:" + "f".repeat(64), startRevision: 0, epoch, mismatch: Promise.resolve(undefined)
        }));
      `;
        const output = yield* Effect.tryPromise({
          try: (signal) => execute("bun", ["-e", script], { signal, timeout: 15000 }),
          catch: (cause) =>
            cause instanceof Error ? cause : new Error("Generation probe failed", { cause }),
        });
        expect(output.stdout.trim().split("\n").at(-1)).toBe("false");
        expect(existsSync(join(root, ".relkit/dev/sessions"))).toBe(false);
      }),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  ),
);
