/** History failures preserve native evidence and have stable recovery categories. */
import { expect, test } from "vitest";
import { historyNativeFailure } from "../src/history-native.service.js";
import { historyFailureHint } from "../src/tool-history.js";

test("writer conflicts remain explicit and never imply deleting the database", () => {
  const primary = new Error(
    "IO Error: Could not set lock on file: Conflicting lock is held by PID 82429",
  );
  const failure = historyNativeFailure(primary);
  expect(failure.operation).toBe("history.writer-conflict");
  expect(failure.cause).toBe(primary);
});

test("permission/corruption errors retain their exact original evidence", () => {
  for (const message of ["permission denied", "database corruption"]) {
    const primary = new Error(message);
    const failure = historyNativeFailure(primary);
    expect(failure.operation).toBe("history.unavailable");
    expect(failure.cause).toBe(primary);
  }
});

test("a writer conflict names only the lock holder's PID", () => {
  const failure = historyNativeFailure(
    new Error(
      'IO Error: Could not set lock on file "/private/app/.relkit/observability/observability.duckdb": Conflicting lock is held in /usr/local/bin/node (PID 20123) by user someone.',
    ),
  );
  const hint = historyFailureHint(failure);
  expect(hint).toContain("(PID 20123)");
  expect(hint).toContain("--history-directory");
  expect(hint).not.toContain("/private/app");
  expect(historyFailureHint(historyNativeFailure(new Error("permission denied")))).toBeUndefined();
});
