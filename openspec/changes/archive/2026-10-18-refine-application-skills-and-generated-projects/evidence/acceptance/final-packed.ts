/** Repack and re-exercise final certified bytes; preserve the earlier successful closure separately. */
import assert from "node:assert/strict";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { templateDigest } from "../../../../../scripts/release-create-evidence.ts";
import { repository } from "./packed-support.ts";
const result = await Bun.file(join(import.meta.dir, "certification-result.json")).json();
assert.equal(result.measured, true, "Final consumers require completed certification");
assert.equal(await templateDigest(join(repository, "templates/default/v1/minimal")), result.entry.templateDigest, "Final consumers require certification of current template bytes");
const previous = join(import.meta.dir, "before-certification");
await mkdir(previous, { recursive: true });
const packed = await Bun.file(join(import.meta.dir, "packed-results.json")).json();
for (const name of ["artifacts.json", "packed-results.json", ...packed.results.filter((item: { passed: boolean }) => item.passed).map((item: { label: string }) => item.label + ".log")])
  await copyFile(join(import.meta.dir, name), join(previous, name));
const artifacts = await Bun.file(join(import.meta.dir, "artifacts.json")).json();
assert.ok(artifacts.directory.includes("/relkit-acceptance-artifacts-"));
await rm(artifacts.directory, { recursive: true, force: true });
await import("./pack.ts");
await import("./packed.ts");
