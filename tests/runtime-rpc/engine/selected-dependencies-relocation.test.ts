/**
 * Executes compiler-emitted preflight from real generated and relocated module paths.
 * Native fixture adapter/SDK modules verify metadata resolution and evaluation order;
 * these shared-preflight regressions are separate from packed production acceptance.
 */
import { expect, it } from "vitest";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startFixture, startupFixture } from "./selected-dependencies.fixture.js";

it("relocated preflight resolves the emitted production install before evaluating its SDK", () => {
  const fixture = startupFixture();
  try {
    const build = join(fixture.root, ".relkit/build");
    const server = join(build, "server");
    mkdirSync(server, { recursive: true });
    renameSync(join(fixture.root, "node_modules"), join(build, "node_modules"));
    const entry = join(server, "index.js");
    renameSync(fixture.entry, entry);
    const started = startFixture(fixture.root, entry);
    expect(started.status, started.stderr).toBe(0);
    expect(started.stdout).toContain("native SDK evaluated");
    expect(started.stdout).toContain("READY");

    rmSync(join(build, "node_modules/@fixture/adapter/node_modules/fixture-sdk"), {
      recursive: true,
    });
    const missing = startFixture(fixture.root, entry);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("RELKIT_DEPENDENCY_MISSING");
    expect(missing.stdout).not.toContain("native SDK evaluated");
    expect(missing.stdout).not.toContain("READY");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

it("generated development modules retain their application dependency ancestry", () => {
  const fixture = startupFixture();
  try {
    const generated = join(fixture.root, ".relkit/generated/generation");
    mkdirSync(generated, { recursive: true });
    const entry = join(generated, "runtime-integrations.js");
    renameSync(fixture.entry, entry);
    const started = startFixture(fixture.root, entry);
    expect(started.status, started.stderr).toBe(0);
    expect(started.stdout).toContain("native SDK evaluated");
    expect(started.stdout).toContain("READY");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
