import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { EvaluatorProcessError, runEvaluatorProcess } from "../src/discovery/evaluator-process.js";
import type { EvaluatorRequest } from "../src/discovery/evaluator-protocol.js";
import { makeProcess } from "./discovery/process-fixture.js";
const request: EvaluatorRequest = {
  protocol: "relkit.evaluator",
  version: 1,
  generationId: "process-test",
  projectRoot: "/test",
  candidates: [],
  environmentAllowlist: [],
  generatedDirectory: ".relkit/generated",
  networkAllowlist: [],
  sourceMaps: true,
  timeoutMs: 100,
};
describe("evaluator process lifetime", () => {
  it.effect("collects output and reaps a successful process without killing it", () =>
    Effect.gen(function* () {
      const fake = makeProcess({ completeOnEnd: true });
      const result = yield* runEvaluatorProcess(request, "/child", () => fake.process);
      expect(result).toEqual({ exitCode: 0, timedOut: false, stdout: "out", stderr: "err" });
      expect(fake.writes).toHaveLength(1);
      expect(JSON.parse(fake.writes[0] ?? "")).toMatchObject({ generationId: "process-test" });
      expect(fake.signals).toEqual([]);
    }),
  );
  it.effect("identifies spawn failures in the typed transport channel", () =>
    Effect.gen(function* () {
      const cause = new Error("spawn failed");
      const error = yield* Effect.flip(
        runEvaluatorProcess(request, "/child", () => {
          throw cause;
        }),
      );
      expect(error).toBeInstanceOf(EvaluatorProcessError);
      expect(error.operation).toBe("spawn");
      expect(error.cause).toBe(cause);
    }),
  );
  it.effect("kills and reaps the child when stdin rejects", () =>
    Effect.gen(function* () {
      const cause = new Error("write failed");
      const fake = makeProcess({ write: () => Promise.reject(cause) });
      const error = yield* Effect.flip(runEvaluatorProcess(request, "/child", () => fake.process));
      expect(error.operation).toBe("stdin");
      expect(error.cause).toBe(cause);
      expect(fake.signals).toEqual(["SIGKILL"]);
      expect(fake.process.exitCode).toBe(137);
    }),
  );
  it.effect("applies the deadline while a stdin write is still pending", () =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      const fake = makeProcess({
        write: () => {
          Deferred.doneUnsafe(ready, Effect.void);
          return new Promise<number>(() => {});
        },
      });
      const fiber = yield* Effect.forkChild(
        runEvaluatorProcess(request, "/child", () => fake.process),
      );
      yield* Deferred.await(ready);
      yield* TestClock.adjust(100);
      const result = yield* Fiber.join(fiber);
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(137);
      expect(fake.signals).toEqual(["SIGKILL"]);
    }),
  );
  it.effect("preserves interruption and awaits child cleanup", () =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      const fake = makeProcess({
        write: () => {
          Deferred.doneUnsafe(ready, Effect.void);
          return 1;
        },
      });
      const fiber = yield* Effect.forkChild(
        runEvaluatorProcess(request, "/child", () => fake.process),
      );
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(fake.signals).toEqual(["SIGKILL"]);
      expect(fake.process.exitCode).toBe(137);
    }),
  );
  it.effect("drains partial output after the deadline forces termination", () =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      const fake = makeProcess({
        pendingOutput: true,
        write: () => {
          Deferred.doneUnsafe(ready, Effect.void);
          return 1;
        },
      });
      const fiber = yield* Effect.forkChild(
        runEvaluatorProcess(request, "/child", () => fake.process),
      );
      yield* Deferred.await(ready);
      yield* TestClock.adjust(100);
      expect(yield* Fiber.join(fiber)).toEqual({
        exitCode: 137,
        timedOut: true,
        stdout: "out",
        stderr: "err",
      });
      expect(fake.signals).toEqual(["SIGKILL"]);
    }),
  );
  it.effect("retains output read failures after the process exits", () =>
    Effect.gen(function* () {
      const cause = new Error("stdout failed");
      const fake = makeProcess({ completeOnEnd: true, pendingOutput: true, afterExitError: cause });
      const error = yield* Effect.flip(runEvaluatorProcess(request, "/child", () => fake.process));
      expect(error.operation).toBe("stdout");
      expect(error.cause).toBe(cause);
      expect(fake.signals).toEqual([]);
    }),
  );
  it.effect("supervises a read failure before a hanging child's deadline", () =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      const cause = new Error("reader failed while child runs");
      const fake = makeProcess({
        pendingOutput: true,
        write: () => {
          Deferred.doneUnsafe(ready, Effect.void);
          return 1;
        },
      });
      const fiber = yield* Effect.forkChild(
        runEvaluatorProcess(request, "/child", () => fake.process),
      );
      yield* Deferred.await(ready);
      fake.failStdout(cause);
      const error = yield* Effect.flip(Fiber.join(fiber));
      expect(error.operation).toBe("stdout");
      expect(error.cause).toBe(cause);
      expect(fake.signals).toEqual(["SIGKILL"]);
      expect(fake.cancellations).toEqual(["err"]);
      expect(fake.process.exitCode).toBe(137);
    }),
  );
  it.effect("cancels pending readers on interruption before reaping", () =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      const fake = makeProcess({
        pendingOutput: true,
        write: () => {
          Deferred.doneUnsafe(ready, Effect.void);
          return 1;
        },
      });
      const fiber = yield* Effect.forkChild(
        runEvaluatorProcess(request, "/child", () => fake.process),
      );
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
      expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
      expect(fake.cancellations.sort()).toEqual(["err", "out"]);
      expect(fake.signals).toEqual(["SIGKILL"]);
      expect(fake.process.exitCode).toBe(137);
    }),
  );
});
