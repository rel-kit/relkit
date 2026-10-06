import { expect, it } from "@effect/vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Effect, Exit, Fiber, Logger, Schema } from "effect";
import { cliPromise } from "../../src/cli-errors.js";
import { CliProcess, processLayer } from "../../src/services/process.service.js";
import { CliCleanup } from "../../src/services/cleanup.service.js";

const childPids = Schema.Struct({ parent: Schema.Number, descendant: Schema.Number });

/** Reads a native child receipt after its atomic publication.
 * @param path - Fixture-owned PID receipt file.
 * @returns Validated positive native process identifiers after publication.
 */
const awaitPids = (path: string) =>
  Effect.gen(function* () {
    for (;;) {
      const text = yield* cliPromise("test.process.receipt", () => readFile(path, "utf8")).pipe(
        Effect.catchTag("CliAdapterError", () => Effect.succeed(undefined)),
      );
      if (text !== undefined)
        return yield* Effect.sync(() => Schema.decodeUnknownSync(childPids)(JSON.parse(text)));
      yield* Effect.sleep(10);
    }
  }).pipe(Effect.timeout(5_000));

/** Waits for a fixture-owned process to disappear from the native process table.
 * @param pid - Exclusively spawned test process identifier.
 * @returns Native disappearance; other kill/probe failures remain defects.
 */
const awaitGone = (pid: number) =>
  Effect.gen(function* () {
    for (;;) {
      const present = yield* Effect.sync(() => {
        try {
          process.kill(pid, 0);
          return true;
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
          throw error;
        }
      });
      if (!present) return;
      yield* Effect.sleep(10);
    }
  }).pipe(Effect.timeout(5_000));

it.live(
  "captures both native pipes completely and preserves a nonzero exit status",
  () =>
    Effect.gen(function* () {
      const processes = yield* CliProcess;
      const stdout = "α".repeat(32_768);
      const stderr = "stderr\n".repeat(16_384);
      const output = yield* processes.run({
        command: process.execPath,
        args: [
          "-e",
          'process.stdout.write("α".repeat(32768)); process.stderr.write("stderr\\n".repeat(16384)); process.exitCode = 7;',
        ],
        cwd: process.cwd(),
      });
      expect(output).toEqual({ exitCode: 7, stdout, stderr });
      expect(yield* CliCleanup.use((cleanup) => cleanup.snapshot())).toEqual([]);
    }).pipe(Effect.provide(processLayer), Effect.provide(Logger.layer([]))),
  10_000,
);

it.live.skipIf(process.platform === "win32")(
  "output-limit failure reaps its native process group and retains the primary size error",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.acquireRelease(
          cliPromise("test.process.root", () => mkdtemp(join(tmpdir(), "relkit-cli-process-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
        );
        const receipt = join(root, "pids.json");
        const source = `const { spawn } = require("node:child_process"); const { writeFileSync, renameSync } = require("node:fs");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(process.argv[1] + ".tmp", JSON.stringify({ parent: process.pid, descendant: child.pid }));
renameSync(process.argv[1] + ".tmp", process.argv[1]); process.stdout.write("x".repeat(8192)); setInterval(() => {}, 1000);`;
        const processes = yield* CliProcess;
        const failure = yield* Effect.flip(
          processes.run({
            command: process.execPath,
            args: ["-e", source, receipt],
            cwd: root,
            maximumOutputBytes: 256,
          }),
        );
        expect(failure.operation).toBe("process.outputLimit");
        expect(failure.message).toBe("Process output exceeded its byte limit.");
        const pids = yield* awaitPids(receipt);
        yield* Effect.all([awaitGone(pids.parent), awaitGone(pids.descendant)], { concurrency: 2 });
        expect(yield* CliCleanup.use((cleanup) => cleanup.snapshot())).toEqual([]);
      }),
    ).pipe(Effect.provide(processLayer), Effect.provide(Logger.layer([]))),
  15_000,
);

it.live.skipIf(process.platform === "win32")(
  "interruption joins the native compiler process group including its descendant",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.acquireRelease(
          cliPromise("test.process.root", () => mkdtemp(join(tmpdir(), "relkit-cli-process-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
        );
        const receipt = join(root, "pids.json");
        const source = `const { spawn } = require("node:child_process"); const { writeFileSync, renameSync } = require("node:fs");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(process.argv[1] + ".tmp", JSON.stringify({ parent: process.pid, descendant: child.pid }));
renameSync(process.argv[1] + ".tmp", process.argv[1]); setInterval(() => {}, 1000);`;
        const processes = yield* CliProcess;
        const running = yield* Effect.acquireRelease(
          processes
            .run({ command: process.execPath, args: ["-e", source, receipt], cwd: root })
            .pipe(Effect.interruptible, Effect.forkChild),
          (fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid),
        );
        const pids = yield* awaitPids(receipt);
        expect(pids.parent).toBeGreaterThan(0);
        expect(pids.descendant).toBeGreaterThan(0);
        yield* Fiber.interrupt(running);
        const interrupted = yield* Fiber.await(running);
        expect(Exit.isFailure(interrupted)).toBe(true);
        if (Exit.isFailure(interrupted))
          expect(Cause.hasInterruptsOnly(interrupted.cause)).toBe(true);
        yield* Effect.all([awaitGone(pids.parent), awaitGone(pids.descendant)], { concurrency: 2 });
        expect(yield* CliCleanup.use((cleanup) => cleanup.snapshot())).toEqual([]);
      }),
    ).pipe(Effect.provide(processLayer), Effect.provide(Logger.layer([]))),
  15_000,
);
