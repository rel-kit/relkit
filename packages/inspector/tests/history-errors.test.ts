/** History failures preserve native evidence and have stable recovery categories. */
import { expect, test } from "vitest";
import { historyNativeFailure } from "../src/history-native.service.js";

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
