import { expect, test } from "bun:test";
import { telemetryOpenFailure } from "./src/commands/dev-telemetry-error";
import { createReporter, toFailure } from "./src/main-support";

test("telemetry lock errors name the owner and recovery without DuckDB noise", () => {
  const failure = telemetryOpenFailure(
    "/workspace/.relkit/observability",
    new Error(
      'IO Error: Could not set lock on file "ignored": Conflicting lock is held in /opt/homebrew/bin/node (PID 82429) by user developer.',
    ),
  );

  expect(failure).toMatchObject({ code: "RELKIT_DEV_TELEMETRY_LOCKED", exitCode: 1 });
  expect(failure.message).toBe(
    [
      "Local telemetry is already in use by another dev session.",
      "",
      "  Database  /workspace/.relkit/observability/observability.duckdb",
      "  Owner     PID 82429 (node)",
      "",
      "Stop that session with Ctrl-C, then run `bun dev` again.",
    ].join("\n"),
  );
  expect(failure.message).not.toContain("IO Error");

  const stderr: string[] = [];
  const reported = toFailure(failure, new AbortController().signal);
  createReporter(false, { stdout: () => undefined, stderr: (line) => stderr.push(line) }).error(
    reported.code,
    reported.message,
  );
  expect(stderr[0]).toStartWith("RELKIT_DEV_TELEMETRY_LOCKED: Local telemetry");
});

test("other telemetry open failures retain their diagnostic", () => {
  const failure = telemetryOpenFailure("/workspace/telemetry", new Error("permission denied"));

  expect(failure).toMatchObject({ code: "RELKIT_DEV_TELEMETRY_UNAVAILABLE", exitCode: 1 });
  expect(failure.message).toContain("permission denied");
});
