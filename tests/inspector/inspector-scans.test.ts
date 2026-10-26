/** Checks source/payload boundaries and native build-directory ownership before bundle traversal. */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  FORBIDDEN_PAYLOAD_MARKERS,
  payloadViolations,
  scanInspectorBundles,
  scanInspectorImports,
} from "./inspector-scans.ts";

const root = resolve(import.meta.dir, "../..");

describe("inspector protocol boundary scans", () => {
  test("rejects selected bundle directories outside the inspector", async () => {
    for (const dist of ["../../..", "/tmp", "../inspector-other"])
      await expect(scanInspectorBundles(root, dist)).rejects.toThrow("build directory");
  });

  test("keeps imports and network access behind the local protocol clients", async () => {
    const result = await scanInspectorImports(root);
    expect(result.files).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
    expect(result.networkFiles).toEqual([
      "apps/inspector/app/%5Frelkit/backend/[...path]/route.ts",
      "apps/inspector/app/application-runtime-client.ts",
      "apps/inspector/lib/api-transport.ts",
      "apps/inspector/lib/stream.ts",
    ]);
  });

  test("detects forbidden handler, provider, and secret payloads", () => {
    const safe = '{"protocol":"relkit.inspector","graphHash":"sha256:fixture"}';
    expect(payloadViolations("safe", safe)).toEqual([]);
    for (const marker of FORBIDDEN_PAYLOAD_MARKERS)
      expect(payloadViolations("unsafe", marker)).toContain(`unsafe: ${marker}`);
    expect(payloadViolations("unsafe", '{"handler":{}}')).toContain("unsafe: handler object");
    expect(payloadViolations("unsafe", "ProviderClient")).toContain(
      "unsafe: provider client or secret",
    );
  });
});

test("admitted build names cannot traverse an external root symlink", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "relkit-inspector-scan-"));
  try {
    const inspector = resolve(fixture, "apps/inspector");
    const outside = resolve(fixture, "outside");
    await mkdir(inspector, { recursive: true });
    await mkdir(resolve(outside, "static"), { recursive: true });
    await writeFile(resolve(outside, "static/private.js"), "export const privateValue = 1;");
    await symlink(outside, resolve(inspector, ".next-escape"));
    await expect(scanInspectorBundles(fixture, ".next-escape")).rejects.toThrow(
      "outside inspector",
    );
    await rm(resolve(outside, "static"), { recursive: true });
    await expect(scanInspectorBundles(fixture, ".next-escape")).rejects.toThrow(
      "outside inspector",
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("missing build candidates remain empty and native dev bundles remain scannable", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "relkit-inspector-scan-"));
  try {
    const inspector = resolve(fixture, "apps/inspector");
    await mkdir(inspector, { recursive: true });
    expect(await scanInspectorBundles(fixture, ".next-missing")).toEqual({
      browserFiles: 0,
      serverFiles: 0,
      violations: [],
    });
    const build = resolve(inspector, ".relkit/next-e2e-owned/dev");
    await mkdir(resolve(build, "static"), { recursive: true });
    await mkdir(resolve(build, "server"));
    await writeFile(resolve(build, "static/client.js"), "export const ready = true;");
    await writeFile(resolve(build, "server/server.js"), "export const ready = true;");
    await symlink(resolve(fixture, "outside"), resolve(build, "static/ignored"));
    expect(await scanInspectorBundles(fixture, ".relkit/next-e2e-owned")).toEqual({
      browserFiles: 1,
      serverFiles: 1,
      violations: [],
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("external candidate directories fail closed rather than becoming an empty scan", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "relkit-inspector-scan-"));
  try {
    const build = resolve(fixture, "apps/inspector/.next-owned");
    const outside = resolve(fixture, "outside");
    await mkdir(build, { recursive: true });
    await mkdir(outside);
    await writeFile(resolve(outside, "private.js"), "export const privateValue = 1;");
    await symlink(outside, resolve(build, "static"));
    await expect(scanInspectorBundles(fixture, ".next-owned")).rejects.toThrow("outside inspector");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
