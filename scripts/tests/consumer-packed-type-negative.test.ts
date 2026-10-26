/** Verifies native negative-compiler diagnostics remain exact while every unexpected cause stays failed. These pure error-boundary cases never replace SDK declarations or consumer resolution. */
import { expect, test } from "bun:test";
import { Cause, Effect, Exit } from "effect";
import { packedCompilerDiagnostic } from "../consumer-packed-type-negative.js";
import { ScaffoldProcessFailure } from "../scaffold-process.errors.js";

test("reads the compiler message once instead of its duplicate rendered stack", () => {
  const message =
    "consumer.ts(9,7): error TS2322: Type 'string' is not assignable to type 'number'.";
  const failure = new ScaffoldProcessFailure({ operation: "process.exit", message });
  const diagnostic = Effect.runSync(packedCompilerDiagnostic(Exit.fail(failure)));
  expect(diagnostic).toBe(message);
  expect(diagnostic.match(/error TS\d+:/g)).toEqual(["error TS2322:"]);
});

test("retains genuinely repeated compiler diagnostics instead of deduplicating", () => {
  const message =
    "consumer.ts(9,7): error TS2322: mismatch\nconsumer.ts(10,7): error TS2322: mismatch";
  const failure = new ScaffoldProcessFailure({ operation: "process.exit", message });
  const diagnostic = Effect.runSync(packedCompilerDiagnostic(Exit.fail(failure)));
  expect(diagnostic).toBe(message);
  expect(diagnostic.match(/error TS\d+:/g)).toEqual(["error TS2322:", "error TS2322:"]);
});

test("a successful negative compilation yields no expected diagnostics", () => {
  expect(Effect.runSync(packedCompilerDiagnostic(Exit.succeed("")))).toBe("");
});

test("preserves defects interruption deadlines mixed causes and unexpected process operations", () => {
  const native = new ScaffoldProcessFailure({
    operation: "process.exit",
    message: "error TS2322:",
  });
  const spawn = new ScaffoldProcessFailure({
    operation: "process.spawn",
    message: "error TS2322:",
  });
  const defect = new Error("native compiler boundary defect");
  const causes = [
    Cause.die(defect),
    Cause.interrupt(),
    Cause.combine(Cause.fail(native), Cause.die(defect)),
    Cause.combine(Cause.fail(native), Cause.interrupt()),
    Cause.combine(Cause.fail(native), Cause.fail(spawn)),
    Cause.fail(spawn),
    Cause.fail(new Cause.TimeoutError("native compiler deadline")),
  ];
  for (const cause of causes) {
    const result = Effect.runSyncExit(packedCompilerDiagnostic(Exit.failCause(cause)));
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) expect(result.cause).toEqual(cause);
  }
});
