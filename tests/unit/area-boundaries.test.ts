/** Runs the real boundary and konsistent checks against a fixture whose source areas cross their rules. */
import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

/** Writes one fixture file, creating its folder. */
async function write(fixture: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(fixture, path)), { recursive: true });
  await writeFile(join(fixture, path), text);
}

/** A workspace with one `relkit` package, one integration and three cross-area imports. */
async function crossBoundaryFixture(fixture: string): Promise<void> {
  await write(
    fixture,
    "package.json",
    JSON.stringify({
      name: "fixture",
      private: true,
      workspaces: ["packages/*", "integrations/packages/*"],
    }),
  );
  await write(
    fixture,
    "packages/relkit/package.json",
    JSON.stringify({ name: "relkit", version: "0.0.0" }),
  );
  await write(fixture, "packages/relkit/src/runtime-hono/index.ts", "export const app = 1;\n");
  await write(fixture, "packages/relkit/src/providers-local/index.ts", "export const store = 1;\n");
  await write(
    fixture,
    "packages/relkit/src/engine/index.ts",
    'import { store } from "../providers-local/index.js";\nexport const engine = store;\n',
  );
  await write(
    fixture,
    "packages/relkit/src/graph/index.ts",
    'import { app } from "../runtime-hono/index.js";\nexport const graph = app;\n',
  );
  await write(
    fixture,
    "integrations/packages/sample/package.json",
    JSON.stringify({ name: "@relkit/sample", version: "0.0.0", dependencies: { relkit: "0.0.0" } }),
  );
  await write(
    fixture,
    "integrations/packages/sample/src/index.ts",
    'import { app } from "relkit/runtime-hono";\nexport const sample = app;\n',
  );
  await copyFile(join(root, "konsistent.json"), join(fixture, "konsistent.json"));
}

test("source-area boundaries reject cross-area imports in both checks", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-area-boundaries-"));
  try {
    await crossBoundaryFixture(fixture);
    const boundaries = Bun.spawnSync(
      [process.execPath, "run", join(root, "scripts/check-boundaries.ts"), fixture],
      { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
    );
    const report = boundaries.stderr.toString();
    expect(boundaries.exitCode).not.toBe(0);
    expect(report).toContain("[graph-hono-pulumi-import]");
    expect(report).toContain("[engine-local-provider-import]");
    expect(report).toContain(
      '[integration-non-protocol-import] @relkit/sample imports non-protocol area "relkit/runtime-hono"',
    );
    const konsistent = Bun.spawnSync(
      [
        join(root, "node_modules/.bin/konsistent"),
        "check",
        "--config-path",
        join(fixture, "konsistent.json"),
      ],
      { cwd: fixture, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
    );
    const findings = konsistent.stdout.toString() + konsistent.stderr.toString();
    expect(konsistent.exitCode).not.toBe(0);
    expect(findings).toContain("relkit-graph-without-runtime");
    expect(findings).toContain("relkit-engine-without-local-providers");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 120_000);
