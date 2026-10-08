import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { startProject } from "../../src/commands/start.js";
import { nativeStartFixture } from "./native-fixture.js";
import { cliCleanupFailures } from "../../src/cli-cleanup-evidence.js";

/** Actual Bun boundary checks; each scope removes its project only after process release. */
const suite = Effect.scoped(
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-start-owner-"))),
      (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
    );
    const buildDirectory = yield* Effect.promise(() => nativeStartFixture(root));
    const options = {
      projectRoot: root,
      buildDirectory,
      port: 0,
      healthTimeoutMs: 5_000,
      stopTimeoutMs: 100,
    };
    const first = yield* Effect.acquireRelease(
      Effect.promise(() => startProject(options)),
      (handle) => Effect.promise(() => handle.stop()),
    );
    assert.equal(first.process.exitCode, null);
    assert.equal(
      (yield* Effect.promise(() => fetch(`http://127.0.0.1:${first.port}/_relkit/v1/health/live`)))
        .ok,
      true,
    );
    const stop = first.stop();
    assert.equal(first.stop(), stop);
    yield* Effect.promise(() => stop);
    assert.equal(yield* Effect.promise(() => first.exited), 0);
    assert.throws(() => process.kill(first.process.pid, 0));

    const capture = Promise.withResolvers<Bun.Subprocess>();
    // Proxy preserves all actual native overloads while observing their returned handle.
    const spawn = captureSpawn(capture.resolve);
    const unavailable: typeof fetch = Object.assign(
      async () => new Response(null, { status: 503 }),
      { preconnect: fetch.preconnect },
    );
    const failure = yield* Effect.exit(
      Effect.tryPromise({
        try: () => startProject({ ...options, healthTimeoutMs: 100, spawn, fetch: unavailable }),
        catch: (error) => error,
      }),
    );
    assert.equal(failure._tag, "Failure");
    if (Exit.isFailure(failure)) assert.match(String(failure.cause), /did not become ready/);
    const failedChild = yield* Effect.promise(() => capture.promise);
    assert.notEqual(failedChild.exitCode, null);
    assert.throws(() => process.kill(failedChild.pid, 0));

    const controller = new AbortController();
    const entered = Promise.withResolvers<void>();
    const abortedChild = Promise.withResolvers<Bun.Subprocess>();
    const abortSpawn = captureSpawn(abortedChild.resolve);
    const stalled: typeof fetch = Object.assign(
      async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        entered.resolve();
        return await new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          }),
        );
      },
      { preconnect: fetch.preconnect },
    );
    const waiting = startProject({
      ...options,
      signal: controller.signal,
      spawn: abortSpawn,
      fetch: stalled,
    }).then(
      () => {
        throw new Error("Cancellation unexpectedly returned a handle.");
      },
      (error: unknown) => error,
    );
    yield* Effect.promise(() => entered.promise);
    const primary = new Error("Caller cancelled readiness.");
    controller.abort(primary);
    assert.equal(yield* Effect.promise(() => waiting), primary);
    const cancelled = yield* Effect.promise(() => abortedChild.promise);
    // Bun retains a null exitCode when termination was by signal; exited is the reap receipt.
    assert.equal(typeof (yield* Effect.promise(() => cancelled.exited)), "number");
    assert.throws(() => process.kill(cancelled.pid, 0));
    const failedRelease = Promise.withResolvers<Bun.Subprocess>();
    const failedController = new AbortController();
    const releasePrimary = new Error("Readiness owner cancelled.");
    const releaseSecondary = new Error("Injected native termination failed.");
    const beforeAbort = Promise.withResolvers<void>();
    const failingSpawn = new Proxy(captureSpawn(failedRelease.resolve), {
      apply(target, receiver, args) {
        const child: Bun.Subprocess = Reflect.apply(target, receiver, args);
        return new Proxy(child, {
          get(target, key) {
            if (key === "kill")
              return () => {
                throw releaseSecondary;
              };
            return Reflect.get(target, key, target);
          },
        });
      },
    });
    const failingFetch: typeof fetch = Object.assign(
      async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        beforeAbort.resolve();
        return await new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          }),
        );
      },
      { preconnect: fetch.preconnect },
    );
    const failedWaiting = startProject({
      ...options,
      spawn: failingSpawn,
      fetch: failingFetch,
      signal: failedController.signal,
    }).then(
      () => {
        throw new Error("Expected cancellation.");
      },
      (error: unknown) => error,
    );
    yield* Effect.acquireRelease(
      Effect.promise(() => failedRelease.promise),
      (child) =>
        Effect.promise(async () => {
          child.kill("SIGKILL");
          await child.exited;
        }).pipe(Effect.interruptible, Effect.timeout(5_000), Effect.orDie),
    );
    yield* Effect.promise(() => beforeAbort.promise);
    failedController.abort(releasePrimary);
    assert.equal(yield* Effect.promise(() => failedWaiting), releasePrimary);
    assert.ok(
      cliCleanupFailures(releasePrimary).some(
        (issue) => issue.operation === "start.process.release",
      ),
    );
    assert.deepEqual(Object.keys(releasePrimary), []);
    process.stdout.write("native production-start acceptance: 4 passed\n");
  }),
);

await Effect.runPromise(suite.pipe(Effect.timeout(20_000)));

/**
 * Observes real native handles while preserving Bun's full overload contract.
 * @param captured - Nonthrowing test-owned receipt callback.
 * @returns Transparent native spawn authority; no fake process properties are introduced.
 */
function captureSpawn(captured: (child: Bun.Subprocess) => void): typeof Bun.spawn {
  return new Proxy(Bun.spawn, {
    apply(target, receiver, args) {
      const child: Bun.Subprocess = Reflect.apply(target, receiver, args);
      captured(child);
      return child;
    },
  });
}
