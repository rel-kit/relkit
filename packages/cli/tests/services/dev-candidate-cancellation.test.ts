import { expect, it } from "@effect/vitest";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Deferred, Effect, Exit, Fiber, Logger } from "effect";
import { cliOriginalError, cliPromise } from "../../src/cli-errors.js";
import { CliDevSupervisor, devSupervisorLayer } from "../../src/services/dev-supervisor.service.js";

/**
 * Joins an atomically published marker from the exclusively owned native fixture.
 * @param path - Fixture marker outside the candidate's generated directory.
 * @returns Completion when native acquisition or shutdown reaches the requested stage.
 */
const awaitMarker = (path: string) =>
  Effect.gen(function* () {
    for (;;) {
      const present = yield* cliPromise("test.candidate.marker", () => access(path)).pipe(
        Effect.as(true),
        Effect.catchTag("CliAdapterError", () => Effect.succeed(false)),
      );
      if (present) return;
      yield* Effect.sleep(5);
    }
  }).pipe(Effect.timeout(5_000));

/**
 * Acquires one disposable project root without borrowing another process or generation.
 * @returns Root removed after the enclosing test's candidate release has completed.
 */
const temporaryProject = Effect.acquireRelease(
  cliPromise("test.candidate.root", () => mkdtemp(join(tmpdir(), "relkit-candidate-signal-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

it.live.skipIf(typeof Bun === "undefined")(
  "session abort leaves acquired termination to one stop owner and joins graceful native release",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* temporaryProject;
        const ready = join(root, "ready");
        const stopping = join(root, "stopping");
        const released = join(root, "released");
        const permission = join(root, "release");
        const controller = new AbortController();
        const sdk = yield* CliDevSupervisor;
        const candidate = yield* Effect.acquireRelease(
          sdk.start({
            projectRoot: root,
            token: { sourceToken: 1, generationToken: 1 },
            signal: controller.signal,
            stopTimeoutMs: 2_000,
            operationLogger: { human: false, json: false },
            compile: async ({ outputDirectory }) => {
              await writeFile(
                join(outputDirectory, "index.js"),
                `import { existsSync, writeFileSync } from "node:fs";
process.once("SIGTERM", async () => {
  writeFileSync(${JSON.stringify(stopping)}, "stopping");
  while (!existsSync(${JSON.stringify(permission)})) await Bun.sleep(5);
  writeFileSync(${JSON.stringify(released)}, "released");
  process.exit(0);
});
writeFileSync(${JSON.stringify(ready)}, String(process.pid));
setInterval(() => {}, 1000);
`,
              );
              return { entrypoint: "index.js" };
            },
          }),
          (owned) =>
            Effect.promise(() => writeFile(permission, "release")).pipe(
              Effect.andThen(Effect.promise(() => owned.dispose())),
            ),
        );
        yield* awaitMarker(ready);
        yield* Effect.sync(() => controller.abort(new Error("Session stopped.")));
        expect(candidate.process.killed).toBe(false);
        expect(candidate.process.exitCode).toBeNull();
        const disposed = yield* sdk.dispose(candidate).pipe(Effect.forkChild);
        yield* awaitMarker(stopping);
        expect(disposed.pollUnsafe()).toBeUndefined();
        expect(candidate.process.exitCode).toBeNull();
        yield* cliPromise("test.candidate.allow-release", () => writeFile(permission, "release"));
        yield* Fiber.join(disposed);
        expect(yield* cliPromise("test.candidate.exit", () => candidate.exited)).toBe(0);
        expect(yield* cliPromise("test.candidate.released", () => readFile(released, "utf8"))).toBe(
          "released",
        );
      }),
    ).pipe(Effect.provide(devSupervisorLayer), Effect.provide(Logger.layer([]))),
  10_000,
);

it.live.skipIf(typeof Bun === "undefined")(
  "pending native acquisition still receives the caller's original cancellation reason",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* temporaryProject;
        const entered = yield* Deferred.make<void>();
        const controller = new AbortController();
        const reason = new Error("Cancelled during compilation.");
        let received: unknown;
        const sdk = yield* CliDevSupervisor;
        const starting = yield* sdk
          .start({
            projectRoot: root,
            token: { sourceToken: 1, generationToken: 1 },
            signal: controller.signal,
            operationLogger: { human: false, json: false },
            compile: ({ signal }) => {
              Deferred.doneUnsafe(entered, Effect.void);
              return new Promise<never>((_, reject) => {
                const abort = () => {
                  received = signal.reason;
                  reject(signal.reason);
                };
                if (signal.aborted) abort();
                else signal.addEventListener("abort", abort, { once: true });
              });
            },
          })
          .pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        yield* Effect.sync(() => controller.abort(reason));
        const outcome = yield* Fiber.await(starting);
        expect(Exit.isFailure(outcome)).toBe(true);
        if (Exit.isFailure(outcome))
          expect(cliOriginalError(Cause.squash(outcome.cause))).toBe(reason);
        expect(received).toBe(reason);
      }),
    ).pipe(Effect.provide(devSupervisorLayer), Effect.provide(Logger.layer([]))),
  10_000,
);

it.live.skipIf(typeof Bun === "undefined")(
  "already aborted acquisition preserves the reason without admitting compilation",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* temporaryProject;
        const controller = new AbortController();
        const reason = new Error("Already cancelled.");
        controller.abort(reason);
        let compilations = 0;
        const sdk = yield* CliDevSupervisor;
        const failure = yield* Effect.flip(
          sdk.start({
            projectRoot: root,
            token: { sourceToken: 1, generationToken: 1 },
            signal: controller.signal,
            operationLogger: { human: false, json: false },
            compile: () => {
              compilations += 1;
              throw new Error("Cancelled acquisition must not compile.");
            },
          }),
        );
        expect(cliOriginalError(failure)).toBe(reason);
        expect(compilations).toBe(0);
      }),
    ).pipe(Effect.provide(devSupervisorLayer), Effect.provide(Logger.layer([]))),
);

it.live.skipIf(typeof Bun === "undefined")(
  "Effect interruption aborts and joins pending physical compilation",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* temporaryProject;
        const entered = yield* Deferred.make<void>();
        const settled = yield* Deferred.make<void>();
        const sdk = yield* CliDevSupervisor;
        const starting = yield* sdk
          .start({
            projectRoot: root,
            token: { sourceToken: 1, generationToken: 1 },
            operationLogger: { human: false, json: false },
            compile: ({ signal }) => {
              Deferred.doneUnsafe(entered, Effect.void);
              return new Promise<never>((_, reject) => {
                const abort = () => {
                  Deferred.doneUnsafe(settled, Effect.void);
                  reject(signal.reason);
                };
                if (signal.aborted) abort();
                else signal.addEventListener("abort", abort, { once: true });
              });
            },
          })
          .pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        yield* Fiber.interrupt(starting);
        const outcome = yield* Fiber.await(starting);
        expect(Exit.isFailure(outcome)).toBe(true);
        if (Exit.isFailure(outcome)) expect(Cause.hasInterruptsOnly(outcome.cause)).toBe(true);
        expect(yield* Deferred.isDone(settled)).toBe(true);
      }),
    ).pipe(Effect.provide(devSupervisorLayer), Effect.provide(Logger.layer([]))),
  10_000,
);
