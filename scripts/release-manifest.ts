import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type Artifact = {
  name: string;
  version: string;
  file: string;
  sha256: string;
  sha512: string;
  integrity: string;
  dependencies?: Record<string, string>;
};
export type Manifest = {
  protocol: string;
  version: string;
  commit: string;
  packageOrder: string[];
  packages: Artifact[];
};

/** Validates saved bytes before granting them publication authority, including historical v1 runs. */
export function readManifest(directory: string): Manifest {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as Manifest;
  assert.ok(
    ["relkit.release-manifest.v1", "relkit.release-manifest.v2"].includes(manifest.protocol),
    "Unsupported release manifest protocol",
  );
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(
    Array.isArray(manifest.packages) && manifest.packages.length > 0,
    "Release manifest contains no packages",
  );
  assert.deepEqual(
    manifest.packageOrder,
    manifest.packages.map(({ name }) => name),
    "Release package order does not match the artifact list",
  );
  assert.equal(
    new Set(manifest.packageOrder).size,
    manifest.packages.length,
    "Release manifest contains duplicate packages",
  );
  for (const artifact of manifest.packages) {
    assert.match(artifact.name, /^(?:@relkit\/[a-z0-9-]+|create-relkit|relkit)$/);
    assert.match(artifact.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
    assert.ok(
      basename(artifact.file) === artifact.file && artifact.file.endsWith(".tgz"),
      "Invalid release artifact path",
    );
    if (manifest.protocol === "relkit.release-manifest.v1")
      assert.equal(artifact.version, manifest.version);
    const bytes = readFileSync(join(directory, artifact.file));
    const sha512 = createHash("sha512").update(bytes).digest("hex");
    assert.ok(
      createHash("sha256").update(bytes).digest("hex") === artifact.sha256 &&
        sha512 === artifact.sha512 &&
        `sha512-${Buffer.from(sha512, "hex").toString("base64")}` === artifact.integrity,
      `Release artifact checksum mismatch: ${artifact.file}`,
    );
    if (manifest.protocol === "relkit.release-manifest.v2") {
      assert.ok(
        artifact.dependencies &&
          typeof artifact.dependencies === "object" &&
          !Array.isArray(artifact.dependencies),
        "Missing release dependency pins",
      );
      for (const [name, version] of Object.entries(artifact.dependencies)) {
        assert.match(name, /^(?:@relkit\/[a-z0-9-]+|create-relkit|relkit)$/);
        assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
        const dependency = manifest.packages.find((item) => item.name === name);
        if (dependency) {
          assert.equal(dependency.version, version, `Release dependency version mismatch: ${name}`);
          assert.ok(
            manifest.packageOrder.indexOf(name) < manifest.packageOrder.indexOf(artifact.name),
            `Release dependency order mismatch: ${name}`,
          );
        }
      }
    }
  }
  return manifest;
}
