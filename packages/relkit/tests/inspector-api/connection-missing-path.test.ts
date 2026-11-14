/**
 * An Inspector started where no development session has published a connection directory polls
 * for it; a missing path is absence, not a failed operation, so nothing is logged at error level
 * on each poll (IN-48). A real failure is still logged.
 */
import { expect, it } from "@effect/vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Logger } from "effect";
import {
  inspectionDirectory,
  inspectionLstat,
} from "../../src/inspector-api/connection/files-native.js";

/**
 * Runs an effect and collects the messages it logs at error level.
 * @param effect - Effect under test.
 * @returns Its result and the error-level messages.
 */
function withErrorLogs<A, E>(effect: Effect.Effect<A, E>) {
  const errors: string[] = [];
  const logger = Logger.make((event) => {
    if (event.logLevel === "Error") errors.push(String(event.message));
  });
  return Effect.exit(effect).pipe(
    Effect.provide(Logger.layer([logger])),
    Effect.map((exit) => ({ exit, errors })),
  );
}

it.effect("a project without a connection directory is absence and logs nothing", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-no-session-")));
    const { exit, errors } = yield* withErrorLogs(inspectionDirectory(root, "read"));
    yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    expect(exit._tag).toBe("Success");
    expect(exit._tag === "Success" ? exit.value : "present").toBeUndefined();
    expect(errors).toEqual([]);
  }),
);

it.effect("a path that cannot be inspected still fails and logs", () =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-bad-path-")));
    const file = join(root, "file");
    yield* Effect.promise(() => writeFile(file, ""));
    // A path through a regular file fails with ENOTDIR, which is not absence.
    const { exit, errors } = yield* withErrorLogs(inspectionLstat(join(file, "child")));
    yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    expect(exit._tag).toBe("Failure");
    expect(errors).toEqual(["Execution operation failed"]);
  }),
);
