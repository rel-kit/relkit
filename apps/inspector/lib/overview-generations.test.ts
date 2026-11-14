import { describe, expect, test } from "bun:test";
import { generationHistory } from "./overview-generations";

const log = (
  cursor: number,
  message: string,
  fields: Record<string, unknown>,
  minute = cursor,
) => ({
  cursor: String(cursor),
  message,
  timestamp: `2026-11-15T10:${String(minute).padStart(2, "0")}:00.000Z`,
  fields,
});

describe("generation history (IN-28)", () => {
  test("labels a start, a reload, a restart and a failure, newest first", () => {
    const groups = generationHistory([
      log(1, "dev.generation.active", {
        version: 0,
        initial: true,
        runId: "run-a",
        reason: "start",
      }),
      log(2, "dev.generation.swapped", {
        version: 1,
        changedFiles: 3,
        runId: "run-a",
        reason: "reload",
      }),
      log(3, "dev.generation.failed", {
        message: "Candidate validation failed.",
        cause: "src/a.ts(1,1): error TS1005\nline two\nline three\nline four",
        runId: "run-a",
        reason: "reload",
      }),
      log(4, "dev.generation.active", {
        version: 2,
        changedFiles: 1,
        runId: "run-b",
        reason: "restart",
      }),
    ]);
    expect(groups.map((group) => group.runId)).toEqual(["run-b", "run-a"]);
    const [b, a] = groups;
    expect(b!.entries.map((entry) => entry.title)).toEqual(["Restarted to apply a change"]);
    expect(b!.entries[0]!.current).toBe(true);
    expect(a!.entries.map((entry) => entry.title)).toEqual([
      "Reload failed: Candidate validation failed.",
      "Reloaded (3 files changed)",
      "Development session started",
    ]);
    expect(a!.entries[0]!.cause).toEqual(["src/a.ts(1,1): error TS1005", "line two", "line three"]);
    expect(a!.entries.some((entry) => entry.current)).toBe(false);
    expect(a!.startedAt).toBe("2026-11-15T10:01:00.000Z");
  });

  test("an older server without runId or reason falls back to initial and changed files", () => {
    const groups = generationHistory([
      log(1, "dev.generation.active", { version: 0, initial: true }),
      log(2, "dev.generation.active", { version: 1, changedFiles: 1 }),
      log(3, "dev.generation.active", { version: 0, initial: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.runId).toBeUndefined();
    expect(groups[0]!.entries.map((entry) => entry.title)).toEqual([
      "Development session started",
      "Reloaded (1 file changed)",
      "Development session started",
    ]);
    expect(groups[0]!.entries[0]!.current).toBe(true);
  });

  test("a restart that failed says so", () => {
    const [group] = generationHistory([
      log(1, "dev.generation.failed", {
        message: "Process exited.",
        runId: "r",
        reason: "restart",
      }),
    ]);
    expect(group!.entries[0]!.title).toBe("Restart failed: Process exited.");
    expect(group!.entries[0]!.state).toBe("failed");
  });

  test("keeps only the newest entries", () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      log(index + 1, "dev.generation.swapped", { changedFiles: 1, runId: "r" }),
    );
    expect(generationHistory(items, 8)[0]!.entries).toHaveLength(8);
  });
});
