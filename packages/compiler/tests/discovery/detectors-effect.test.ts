import { afterEach, describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { vi } from "vitest";
import {
  acquireEvaluatorDetectors,
  installEvaluatorDetectors,
} from "../../src/discovery/evaluator-detectors.js";
import { evaluateCandidate } from "../../src/discovery/evaluator-child.js";
import { snapshotModuleEffect } from "../../src/discovery/evaluator-child-utils.js";
import type { EvaluatorRequest } from "../../src/discovery/evaluator-protocol.js";
const options = {
  projectRoot: "/test",
  generatedDirectory: "/test/.relkit/generated",
  networkAllowlist: ["allowed.example"],
};
const request: EvaluatorRequest = {
  protocol: "relkit.evaluator",
  version: 1,
  generationId: "path-test",
  projectRoot: "/test",
  candidates: [],
  environmentAllowlist: [],
  generatedDirectory: ".relkit/generated",
  networkAllowlist: [],
  sourceMaps: true,
  timeoutMs: 100,
};
afterEach(() => vi.unstubAllGlobals());
describe("candidate detector ownership", { concurrent: false }, () => {
  it.effect("captures output, reports surviving timers, and restores methods", () =>
    Effect.gen(function* () {
      vi.stubGlobal("Bun", {});
      const originalLog = console.log;
      const originalTimeout = globalThis.setTimeout;
      const report = yield* Effect.scoped(
        Effect.gen(function* () {
          const detector = yield* acquireEvaluatorDetectors(options);
          console.log("candidate output");
          process.stderr.write("candidate error");
          setTimeout(() => {}, 60_000);
          return detector.finish();
        }),
      );
      expect(console.log).toBe(originalLog);
      expect(globalThis.setTimeout).toBe(originalTimeout);
      expect(report.stdout).toBe("candidate output\n");
      expect(report.stderr).toBe("candidate error");
      expect(report.sideEffects.map(({ kind }) => kind)).toEqual([
        "direct-output",
        "direct-output",
        "live-timer",
      ]);
    }),
  );
  it.effect("restores native hooks when the scoped workflow fails or defects", () =>
    Effect.gen(function* () {
      vi.stubGlobal("Bun", {});
      const originalLog = console.log;
      for (const [terminal, failed] of [
        [Effect.fail("expected"), true],
        [Effect.die("defect"), false],
      ] as const) {
        const exit = yield* Effect.scoped(
          Effect.gen(function* () {
            yield* acquireEvaluatorDetectors(options);
            return yield* terminal;
          }),
        ).pipe(Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        expect(Exit.hasFails(exit)).toBe(failed);
        expect(Exit.hasDies(exit)).toBe(!failed);
        expect(console.log).toBe(originalLog);
      }
    }),
  );
  it.effect("preserves interruption while restoring an active candidate session", () =>
    Effect.gen(function* () {
      vi.stubGlobal("Bun", {});
      const originalLog = console.log;
      const ready = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(
        Effect.scoped(
          Effect.gen(function* () {
            yield* acquireEvaluatorDetectors(options);
            yield* Deferred.succeed(ready, undefined);
            return yield* Effect.never;
          }),
        ),
      );
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
      expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
      expect(console.log).toBe(originalLog);
    }),
  );
  it.effect("blocks writes, unapproved network calls, and child processes before invocation", () =>
    Effect.gen(function* () {
      const write = vi.fn((_path: unknown, _value: unknown) => 3);
      const connect = vi.fn((_destination: unknown) => "connected");
      const spawn = vi.fn((_command: unknown) => undefined);
      const bun = { write, connect, spawn };
      vi.stubGlobal("Bun", bun);
      const report = yield* Effect.scoped(
        Effect.gen(function* () {
          const detector = yield* acquireEvaluatorDetectors(options);
          expect(bun.write("/test/.relkit/generated/result", "ok")).toBe(3);
          expect(() => bun.write("/test/source.ts", "bad")).toThrow("Evaluator blocked");
          expect(bun.connect("https://allowed.example/path")).toBe("connected");
          expect(() => bun.connect("https://blocked.example")).toThrow("Evaluator blocked");
          expect(() => bun.spawn("echo blocked")).toThrow("Evaluator blocked");
          return detector.finish();
        }),
      );
      expect(write).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(spawn).not.toHaveBeenCalled();
      expect(report.sideEffects.map(({ kind }) => kind)).toEqual([
        "write-outside-generated-sandbox",
        "unapproved-network",
        "child-process",
      ]);
    }),
  );
  it.effect("rolls back partial acquisition even if one native property cannot restore", () =>
    Effect.sync(() => {
      const bun = Object.defineProperty({}, "listen", {
        value: () => {},
        writable: false,
        configurable: true,
      });
      vi.stubGlobal("Bun", bun);
      const originalLog = console.log;
      const originalTimeout = globalThis.setTimeout;
      const originalWrite = process.stdout.write;
      expect(() => installEvaluatorDetectors(options)).toThrow(AggregateError);
      expect(console.log).toBe(originalLog);
      expect(globalThis.setTimeout).toBe(originalTimeout);
      expect(process.stdout.write).toBe(originalWrite);
    }),
  );
  it.effect("finalizes partial scoped acquisition without losing its native defects", () =>
    Effect.gen(function* () {
      const bun = Object.defineProperty({}, "listen", {
        value: () => {},
        writable: false,
        configurable: true,
      });
      vi.stubGlobal("Bun", bun);
      const originalLog = console.log;
      const originalTimeout = globalThis.setTimeout;
      const originalWrite = process.stdout.write;
      const exit = yield* Effect.scoped(acquireEvaluatorDetectors(options)).pipe(Effect.exit);
      expect(Exit.hasDies(exit)).toBe(true);
      expect(console.log).toBe(originalLog);
      expect(globalThis.setTimeout).toBe(originalTimeout);
      expect(process.stdout.write).toBe(originalWrite);
    }),
  );
  it.effect("cancels owned timers with the original native API and finishes only once", () =>
    Effect.gen(function* () {
      vi.stubGlobal("Bun", {});
      const originalClear = globalThis.clearTimeout;
      const retainedClear = vi.fn(originalClear);
      vi.stubGlobal("clearTimeout", retainedClear);
      yield* Effect.scoped(
        Effect.gen(function* () {
          const detector = yield* acquireEvaluatorDetectors(options);
          const handle = setTimeout(() => {}, 60_000);
          // Candidate mutation must not replace the cancellation capability retained by the owner.
          const candidateClear = vi.fn();
          globalThis.clearTimeout = candidateClear;
          const first = yield* detector.finishEffect();
          const second = yield* detector.finishEffect();
          expect(first.sideEffects.filter(({ kind }) => kind === "live-timer")).toHaveLength(1);
          expect(second.sideEffects).toEqual(first.sideEffects);
          expect(candidateClear).not.toHaveBeenCalled();
          expect(retainedClear).toHaveBeenCalledExactlyOnceWith(handle);
          yield* detector.restoreEffect();
          yield* detector.restoreEffect();
        }),
      );
      expect(globalThis.clearTimeout).toBe(retainedClear);
    }),
  );
  it.effect("frames an escaped candidate path without acquiring global hooks", () =>
    Effect.gen(function* () {
      const originalLog = console.log;
      const result = yield* evaluateCandidate({ file: "../outside.ts" }, request);
      expect(result.failure?.code).toBe("RELKIT_EVALUATOR_IMPORT_FAILED");
      expect(result.module).toBeUndefined();
      expect(console.log).toBe(originalLog);
    }),
  );
  it.effect("completes explicit restoration when a native setter interrupts its fiber", () =>
    Effect.gen(function* () {
      const originalServe = () => undefined;
      let serve = originalServe;
      let interruptDuringRestore = () => {};
      const bun = Object.defineProperty({ serve: originalServe }, "serve", {
        configurable: true,
        get: () => serve,
        set: (next: typeof originalServe) => {
          serve = next;
          if (next === originalServe) interruptDuringRestore();
        },
      });
      vi.stubGlobal("Bun", bun);
      const originalLog = console.log;
      const originalTimeout = globalThis.setTimeout;
      const fiber = yield* Effect.forkChild(
        Effect.scoped(
          Effect.gen(function* () {
            const detector = yield* acquireEvaluatorDetectors(options);
            // Native setter interruption happens synchronously during early release, without sleeps.
            yield* Effect.withFiber((fiber) =>
              Effect.sync(() => {
                interruptDuringRestore = () => fiber.interruptUnsafe();
              }),
            );
            yield* detector.restoreEffect();
          }),
        ),
      );
      const exit = yield* Fiber.await(fiber);
      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(console.log).toBe(originalLog);
      expect(globalThis.setTimeout).toBe(originalTimeout);
      expect(bun.serve).toBe(originalServe);
    }),
  );
  it.effect("snapshots descriptor exports in name order and ignores ordinary values", () =>
    Effect.gen(function* () {
      const descriptor = {
        kind: "middleware",
        id: "policy",
        ref: { kind: "middleware", id: "policy" },
      };
      const result = yield* snapshotModuleEffect(
        { zebra: descriptor, alpha: descriptor, ignored: 42 },
        { file: "src/policy.ts" },
        request,
      );
      expect(result.exports.map(({ exportName }) => exportName)).toEqual(["alpha", "zebra"]);
      expect(result.manifestReferences.map(({ exportName }) => exportName)).toEqual([
        "alpha",
        "zebra",
      ]);
      expect(result.manifestReferences[0]).toMatchObject({
        generationId: "path-test",
        descriptorId: "policy",
        module: "src/policy.ts",
      });
    }),
  );
  it.effect("keeps trusted snapshot defects outside candidate failure recovery", () =>
    Effect.gen(function* () {
      const defect = new Error("snapshot defect");
      const descriptor = new Proxy(
        { kind: "middleware", id: "policy", ref: { kind: "middleware", id: "policy" } },
        {
          ownKeys: () => {
            throw defect;
          },
        },
      );
      const exit = yield* snapshotModuleEffect(
        { candidate: descriptor },
        { file: "src/policy.ts" },
        request,
      ).pipe(Effect.exit);
      expect(Exit.hasDies(exit)).toBe(true);
      expect(Exit.hasFails(exit)).toBe(false);
    }),
  );
});
