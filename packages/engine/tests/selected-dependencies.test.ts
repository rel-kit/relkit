/** Proves validation precedes native module evaluation and production readiness. */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { startFixture, startupFixture } from "./selected-dependencies.fixture.js";

it("rejects a selected SDK removed after preparation before evaluating the adapter", () => {
  const fixture = startupFixture();
  try {
    const prepared = readFileSync(fixture.entry, "utf8");
    const ready = startFixture(fixture.root, fixture.entry);
    expect(ready.status, ready.stderr).toBe(0);
    expect(ready.stdout).toContain("native SDK evaluated\nREADY");
    rmSync(fixture.sdk, { recursive: true });
    const stale = startFixture(fixture.root, fixture.entry);
    expect(stale.status).not.toBe(0);
    expect(stale.stdout).not.toContain("READY");
    expect(stale.stdout).not.toContain("native SDK evaluated");
    expect(stale.stderr).toContain("RELKIT_DEPENDENCY_MISSING");
    expect(readFileSync(fixture.entry, "utf8")).toBe(prepared);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

it("retains a nested SDK initialization failure without relabeling it as absence", () => {
  const fixture = startupFixture();
  try {
    writeFileSync(
      join(fixture.sdk, "index.js"),
      'export const value = "unreachable"; throw new Error("native nested initialization cause", {cause: new Error("original SDK defect")});',
    );
    const failed = startFixture(fixture.root, fixture.entry);
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("native nested initialization cause");
    expect(failed.stderr).toContain("original SDK defect");
    expect(failed.stderr).toContain("RELKIT_DEPENDENCY_INITIALIZATION_FAILED");
    expect(failed.stderr).not.toContain("RELKIT_DEPENDENCY_MISSING");
    expect(failed.stdout).not.toContain("READY");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
