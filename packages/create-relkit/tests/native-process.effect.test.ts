import { expect, it, vi } from "@effect/vitest";
import { watch } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Deferred, Effect, Exit, Fiber, Logger } from "effect";
import { GeneratorProcess, generatorProcessLive } from "../src/generator-process.js";
import { publicFailure } from "../src/generator-errors.js";
import { generatorCleanupFailures } from "../src/generator-cleanup.js";

for (const output of ["stdout", "stderr"] as const) {
  it.live(`joins pending native ${output} after the immediate child exits`, () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const spawned = Promise.withResolvers<Promise<number>>();
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const pendingOutput = new ReadableStream<Uint8Array>(
        {
          start: (value) => {
            controller = value;
          },
          pull: () => {
            Deferred.doneUnsafe(entered, Exit.succeed(undefined));
          },
        },
        { highWaterMark: 0 },
      );
      const nativeSpawn = Bun.spawn;
      const spy = yield* Effect.acquireRelease(
        Effect.sync(() => vi.spyOn(Bun, "spawn")),
        (spy) => Effect.sync(() => spy.mockRestore()),
      );
      spy.mockImplementation(((...args: Parameters<typeof Bun.spawn>) => {
        const child = nativeSpawn(...args);
        spawned.resolve(child.exited);
        return new Proxy(child, {
          get: (target, key) => (key === output ? pendingOutput : Reflect.get(target, key, target)),
        });
      }) as typeof Bun.spawn);
      const running = yield* Effect.forkScoped(
        GeneratorProcess.use((service) =>
          service.run([process.execPath, "-e", "process.exit(0);"], process.cwd()),
        ).pipe(Effect.provide(generatorProcessLive), Effect.provide(Logger.layer([]))),
      );
      yield* Deferred.await(entered);
      yield* Effect.promise(() => spawned.promise);
      let completed = false;
      const interrupting = Effect.runPromise(Fiber.interrupt(running)).then((exit) => {
        completed = true;
        return exit;
      });
      yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)));
      const completedBeforeOutput = completed;
      controller!.close();
      yield* Effect.promise(() => interrupting);
      const exit = yield* Fiber.await(running);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(completedBeforeOutput).toBe(false);
    }),
  );
}

it.live("preserves the primary stream failure when native child release also fails", () =>
  Effect.gen(function* () {
    const primary = new Error("Native stdout failed.");
    const secondary = new Error("Kill reported an error after delivering the signal.");
    const nativeSpawn = Bun.spawn;
    let childPid: number | undefined;
    const spy = yield* Effect.acquireRelease(
      Effect.sync(() => vi.spyOn(Bun, "spawn")),
      (spy) => Effect.sync(() => spy.mockRestore()),
    );
    // The Proxy preserves all native overloads and child fields; only the two fault boundaries differ.
    spy.mockImplementation(((...args: Parameters<typeof Bun.spawn>) => {
      const child = nativeSpawn(...args);
      childPid = child.pid;
      const brokenOutput = new ReadableStream<Uint8Array>({
        start: (controller) => controller.error(primary),
      });
      return new Proxy(child, {
        get: (target, key) =>
          key === "stdout"
            ? brokenOutput
            : key === "kill"
              ? () => {
                  target.kill("SIGKILL");
                  throw secondary;
                }
              : Reflect.get(target, key, target),
      });
    }) as typeof Bun.spawn);
    const exit = yield* Effect.exit(
      GeneratorProcess.use((processService) =>
        processService.run([process.execPath, "-e", "setInterval(() => {}, 1000);"], process.cwd()),
      ),
    ).pipe(Effect.provide(generatorProcessLive), Effect.provide(Logger.layer([])));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(publicFailure(Cause.squash(exit.cause))).toBe(primary);
    expect(generatorCleanupFailures(primary).map((failure) => failure.cause)).toEqual([secondary]);
    expect(childPid).toBeDefined();
    const pid = childPid;
    if (pid !== undefined) expect(() => process.kill(pid, 0)).toThrow();
  }),
);

it.live("kills and awaits a real child and its output drains before interruption completes", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-child-scope-"))),
      (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
    );
    const ready = Promise.withResolvers<number>();
    const watcher = yield* Effect.acquireRelease(
      Effect.sync(() =>
        watch(root, (_event, name) => {
          if (name !== "pid") return;
          void readFile(join(root, "pid"), "utf8").then(
            (value) => {
              const pid = Number(value);
              if (Number.isSafeInteger(pid) && pid > 0) ready.resolve(pid);
            },
            () => undefined,
          );
        }),
      ),
      (watcher) => Effect.sync(() => watcher.close()),
    );
    void watcher;
    const script =
      "await Bun.write(" +
      JSON.stringify(join(root, "pid")) +
      ', String(process.pid)); process.stdout.write("ready"); process.stderr.write("drain"); setInterval(() => {}, 1000);';
    const child = yield* Effect.forkScoped(
      GeneratorProcess.use((processService) =>
        processService.run([process.execPath, "-e", script], root),
      ).pipe(Effect.provide(generatorProcessLive), Effect.provide(Logger.layer([]))),
    );
    const pid = yield* Effect.promise(() => ready.promise);
    yield* Fiber.interrupt(child);
    expect(() => process.kill(pid, 0)).toThrow();
  }),
);

it.live("awaits both native output streams and preserves nonzero exit output", () =>
  Effect.gen(function* () {
    const result = yield* GeneratorProcess.use((processService) =>
      processService.run(
        [
          process.execPath,
          "-e",
          'process.stdout.write("stdout"); process.stderr.write("stderr"); process.exit(7);',
        ],
        process.cwd(),
      ),
    ).pipe(Effect.provide(generatorProcessLive), Effect.provide(Logger.layer([])));
    expect(result).toEqual({ exitCode: 7, stdout: "stdout", stderr: "stderr" });
  }),
);
