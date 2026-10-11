/**
 * Sends real termination signals to an isolated Bun benchmark executable.
 * The test waits for its physical exit and verifies the detached measured child
 * has disappeared; no signal is delivered to the Vitest host or unrelated group.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Option, Schedule } from "effect";

/**
 * Acquires one isolated signal-owning driver and retains bounded output/exit witnesses.
 * @returns Scoped physical driver; release always joins exit or records a forced failure.
 */
const driver = Effect.fn("ReadinessTest.driver")(function* () {
  const child = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const process = spawn("bun", [resolve(__dirname, "fixtures/cancellation-driver.ts")], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      process.stdout.on("data", (bytes: Buffer) => {
        output = (output + bytes).slice(-65_536);
      });
      const exited = new Promise<void>((settle) => {
        process.once("error", () => settle());
        process.once("exit", () => settle());
      });
      process.stderr.resume();
      return { process, exited, output: () => output };
    }),
    (child) =>
      Effect.gen(function* () {
        child.process.kill("SIGTERM");
        const exit = yield* Effect.promise(() => child.exited).pipe(Effect.timeoutOption(7_000));
        child.process.stdout.destroy();
        child.process.stderr.destroy();
        if (Option.isNone(exit)) {
          child.process.kill("SIGKILL");
          yield* Effect.promise(() => child.exited);
          return yield* Effect.die(new Error("Cancellation fixture failed to join shutdown"));
        }
      }),
  );
  return child;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  it.live(`joins the measured group before ${signal} exits its driver`, () =>
    Effect.gen(function* () {
      const child = yield* driver();
      const output = yield* Effect.sync(child.output).pipe(
        Effect.repeat({
          schedule: Schedule.spaced(5),
          until: (text) => /FIXTURE_CHILD:\d+/.test(text),
        }),
        Effect.timeout(5_000),
      );
      const pid = Number(/FIXTURE_CHILD:(\d+)/.exec(output)?.[1]);
      expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
      child.process.kill(signal);
      yield* Effect.promise(() => child.exited).pipe(Effect.timeout(7_000));
      expect(() => process.kill(pid, 0)).toThrow();
    }),
  );
}
