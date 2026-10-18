/** Binds completed behavior evidence to the final source, retained patch and exact certified archives. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { templateDigest } from "../../../../../scripts/release-create-evidence.ts";
import { CREATE_CAPABILITY_TABLE } from "../../../../../packages/create-relkit/src/create-capabilities.ts";
import { hash, repository } from "./packed-support.ts";

const load = (name: string) => Bun.file(join(import.meta.dir, name)).json();
const certification = await load("certification-result.json");
assert.equal(certification.measured, true);
const digest = await templateDigest(join(repository, "templates/default/v1/minimal"));
assert.equal(digest, certification.entry.templateDigest);
assert.equal(CREATE_CAPABILITY_TABLE.entries.length, 1);
assert.equal(CREATE_CAPABILITY_TABLE.entries[0]!.templateDigest, digest);
const packed = await load("packed-results.json");
assert.equal(packed.observations.passed, true);
assert.equal(packed.observations.packedSkillFiles, 65);
assert.equal(packed.results.length, 49);
assert.ok(packed.results.every((item: { passed: boolean }) => item.passed));
const sources: Record<string, boolean> = {};
for (const name of ["mysql-results.json", "postgres-results.json", "guidance-results.json", "final-checks-results.json", "final-skill-links.json"])
  assert.equal(sources[name] = (await load(name)).passed, true);
const catalog = JSON.parse(await readFile(join(repository, "package.json"), "utf8"));
assert.equal(catalog.catalog["drizzle-orm"], "1.0.0-rc.5-169397b");
assert.equal(catalog.catalog["drizzle-kit"], "1.0.0-rc.5-ab785fc");
assert.equal(catalog.catalog.effect, "4.0.1");
const patch = hash(await readFile(join(repository, "patches/drizzle-orm.patch")));
assert.equal(patch, "10ea188b9409dd19aac7bf27f4b12911ae4844c063362b9c2bd11d6a3d936374");
const archives = await load("artifacts.json");
const certified = await load("certified-artifacts.json");
assert.equal(archives.packages.length, 53);
assert.deepEqual(archives.packages.map((item: { name: string; sha256: string }) => [item.name, item.sha256]), certified.packages.map((item: { name: string; sha256: string }) => [item.name, item.sha256]));
for (const key of ["parentIdentity", "directIdentity", "cliIdentity"])
  for (const item of packed.observations[key]) {
    const root = join(repository, "packages", item.name === "create-relkit" ? item.name : "cli");
    assert.equal(item.binSha256, hash(await readFile(join(root, "dist/bin.js"))));
    for (const [file, sha] of Object.entries(item.files))
      assert.equal(sha, hash(await readFile(join(root, file))));
  }
const skills: Record<string, string> = {};
for (const template of ["minimal", "api", "agent", "fullstack", "tasks"]) {
  const root = join(repository, "templates/default/v1", template, ".agents/skills/relkit");
  const files: Record<string, string> = {};
  for await (const file of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true }))
    files[file] = hash(await readFile(join(root, file)));
  assert.equal(Object.keys(files).length, 13);
  if (template === "minimal") Object.assign(skills, files);
  else assert.deepEqual(files, skills);
}
const timing = {} as Record<string, unknown>;
for (const set of ["fresh", "restart"]) {
  const report = await load(`certification-${set}.json`);
  assert.equal(report.attempts.length, 20);
  assert.equal(report.thresholdMs, 1000);
  assert.equal(report.readiness.passed, true);
  assert.equal(report.summary.passed, true);
  timing[set] = report.summary;
}
await writeFile(join(import.meta.dir, "final-audit.json"), JSON.stringify({ passed: true, patch, templateDigest: digest, exactCertifiedArchives: 53, packedCommands: 49, distributedSkillFiles: 65, sources, timing, skillHashes: skills }, null, 2) + "\n");
console.log("Final source, archive, patch, behavior and certification audit passed");
