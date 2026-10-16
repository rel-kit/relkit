import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Schema } from "effect";
import { SnapshotPath, SnapshotResolutionPath } from "../../src/dev-snapshot/snapshot.schemas.js";
import { SnapshotEligibleTsConfig } from "../../src/dev-snapshot/snapshot-eligibility.schemas.js";
import { watchSnapshotInputs } from "../../src/dev-snapshot/snapshot-input-watch.js";

test("snapshot discovery accepts the current generated context declaration with supported root discovery", async () => {
  for (const starter of ["minimal", "api", "agent", "fullstack"]) {
    const path = resolve(
      import.meta.dir,
      "../../../../templates/default/v1",
      starter,
      "tsconfig.json",
    );
    const config = JSON.parse(await readFile(path, "utf8"));
    expect(Schema.is(SnapshotEligibleTsConfig)(config), starter).toBe(true);
  }
});

test("snapshot paths admit authored parameter and catch-all route folders", () => {
  for (const path of [
    "src/routes/orders/[id]/route.ts",
    "src/routes/api/auth/[[...auth]]/route.ts",
  ]) {
    expect(Schema.is(SnapshotPath)(path), path).toBe(true);
    expect(Schema.is(SnapshotResolutionPath)(path), path).toBe(true);
  }
});

test("native integrity workers hash parameter route source paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-bracket-worker-"));
  try {
    const path = "src/routes/orders/[id]/route.ts";
    await mkdir(join(root, "src/routes/orders/[id]"), { recursive: true });
    await writeFile(join(root, path), "export {};\n");
    const worker = resolve(import.meta.dir, "../../src/dev-snapshot/snapshot-hash-worker.ts");
    const child = Bun.spawn([process.execPath, worker, "200"], {
      cwd: root,
      stdin: new Blob([JSON.stringify([path])]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(JSON.parse(stdout)[0].path).toBe(path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native input watches accept bracketed source resolution witnesses", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-bracket-watch-"));
  try {
    await mkdir(join(root, "src/routes/[id]"), { recursive: true });
    const close = watchSnapshotInputs(
      root,
      [],
      [{ kind: "fileExists", path: "src/routes/[id]/route.ts", exists: false }],
      () => {},
      () => {},
    );
    close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("route bracket support preserves containment and exact generated root restrictions", async () => {
  for (const path of [
    "../outside.ts",
    "src/../outside.ts",
    "/outside.ts",
    "src\\outside.ts",
    "C:/outside.ts",
    "src/route.ts\0",
  ]) {
    expect(Schema.is(SnapshotPath)(path), path).toBe(false);
    expect(Schema.is(SnapshotResolutionPath)(path), path).toBe(false);
  }
  const config = JSON.parse(
    await readFile(
      resolve(import.meta.dir, "../../../../templates/default/v1/minimal/tsconfig.json"),
      "utf8",
    ),
  );
  expect(
    Schema.is(SnapshotEligibleTsConfig)({
      ...config,
      files: [...config.files, ".relkit/generated/arbitrary.ts"],
    }),
  ).toBe(false);
});
