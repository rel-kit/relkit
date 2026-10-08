import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { createCliLoggerEffect } from "../../src/cli-logger.js";

it.effect("drains ordered native log callbacks before returning the original failure", () =>
  Effect.gen(function* () {
    const stderr: string[] = [];
    const primary = new Error("command failure");
    const exit = yield* Effect.exit(
      Effect.scoped(
        Effect.gen(function* () {
          const log = yield* createCliLoggerEffect(true, {
            stdout: () => undefined,
            stderr: (line) => stderr.push(line),
          });
          log("info", "first", { index: 1 });
          log("error", "second", { index: 2 });
          return yield* Effect.fail(primary);
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(exit.cause.reasons).toContainEqual(
        expect.objectContaining({ _tag: "Fail", error: primary }),
      );
    expect(stderr.map((line) => JSON.parse(line).message)).toEqual(["first", "second"]);
    expect(stderr.map((line) => JSON.parse(line).fields.index)).toEqual([1, 2]);
  }),
);

it.effect("a failed log sink cannot replace command completion", () =>
  Effect.gen(function* () {
    const value = yield* Effect.scoped(
      Effect.gen(function* () {
        const log = yield* createCliLoggerEffect(false, {
          stdout: () => undefined,
          stderr: () => {
            throw new Error("sink failed");
          },
        });
        log("info", "retained command result");
        return 23;
      }),
    );
    expect(value).toBe(23);
  }),
);

it.effect("preserves warning and fatal levels while suppressing debug below the minimum", () =>
  Effect.gen(function* () {
    const stderr: string[] = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        const log = yield* createCliLoggerEffect(true, {
          stdout: () => undefined,
          stderr: (line) => stderr.push(line),
        });
        log("debug", "hidden detail");
        log("warn", "warning");
        log("fatal", "fatal");
      }),
    );
    expect(
      stderr.map((line) => {
        const record = JSON.parse(line);
        return { message: record.message, level: record.level };
      }),
    ).toEqual([
      { message: "warning", level: "warn" },
      { message: "fatal", level: "fatal" },
    ]);
  }),
);
