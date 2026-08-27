import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertNoRawSyntheticSecrets,
  scanReleaseArtifacts,
  scanText,
  scanValue,
  SYNTHETIC_SECRETS,
} from "../../scripts/secret-scan.ts";

test("recursively scans values and release artifacts without exposing raw matches", async () => {
  expect(scanText("terminal", "safe output")).toEqual([]);
  expect(scanValue("json", { status: "redacted", nested: [1, null] })).toEqual([]);
  expect(() => assertNoRawSyntheticSecrets("safe", { status: "redacted" })).not.toThrow();

  const root = await mkdtemp(join("/tmp", "relkit-secret-scan-"));
  try {
    await mkdir(join(root, ".relkit", "build"), { recursive: true });
    await mkdir(join(root, "tests", "compiler", "fixtures"), { recursive: true });
    await writeFile(join(root, ".relkit", "build", "manifest.json"), '{"status":"safe"}\n');
    await writeFile(join(root, "tests", "compiler", "fixtures", "expected.graph.json"), "{}\n");

    const clean = await scanReleaseArtifacts(root);
    expect(clean.matches).toEqual([]);
    expect(clean.categories["build-image"]).toBe(1);
    expect(clean.categories.graph).toBe(1);

    await writeFile(
      join(root, ".relkit", "build", "manifest.json"),
      JSON.stringify({ token: SYNTHETIC_SECRETS.password }),
    );
    const dirty = await scanReleaseArtifacts(root);
    expect(dirty.matches).toEqual([
      expect.objectContaining({ secretName: "password", source: ".relkit/build/manifest.json" }),
    ]);
    expect(JSON.stringify(dirty)).not.toContain(SYNTHETIC_SECRETS.password);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
