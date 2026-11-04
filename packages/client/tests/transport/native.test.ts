import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Runs one native Bun fixture in its own process.
 * @param fixture - Fixture path relative to this file.
 * @returns The fixture's standard output.
 */
function runFixture(fixture: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "bun",
      [fileURLToPath(new URL(fixture, import.meta.url))],
      { timeout: 8_000, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) =>
        error === null ? resolve(stdout) : reject(new Error(`${error.message}\n${stderr}`)),
    );
  });
}

it("real HTTP remains available after a synchronous socket constructor failure", async () => {
  expect(await runFixture("../native/auto-fallback-fixture.ts")).toContain("native auto fallback:");
});

it("real Bun pending HTTP and SSE pulls release on return, throw and abort", async () => {
  expect(await runFixture("../native/iterator-fixture.ts")).toContain(
    "native iterator cleanup: 7/7",
  );
}, 10_000);
