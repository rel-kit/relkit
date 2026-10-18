/** Records current source/archive identities without changing admission or historical evidence. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { templateDigest } from "../../../../../scripts/release-create-evidence.ts";
import { CREATE_CAPABILITY_TABLE } from "../../../../../packages/create-relkit/src/create-capabilities.ts";
import { repository, hash } from "./packed-support.ts";

const index = await Bun.file(join(import.meta.dir, "artifacts.json")).json();
for (const artifact of index.packages)
  assert.equal(hash(await readFile(join(index.directory, artifact.file))), artifact.sha256);
const generator = index.packages.find((item: { name: string }) => item.name === "create-relkit");
assert.ok(generator);
const files = await new Bun.Archive(
  await Bun.file(join(index.directory, generator.file)).bytes(),
).files();
const templates = [];
for (const name of ["minimal", "api", "agent", "fullstack", "tasks"]) {
  const base = join(repository, "templates/default/v1", name);
  let checked = 0;
  for (const path of new Bun.Glob(".agents/skills/relkit/**/*.md").scanSync({
    cwd: base,
    dot: true,
  })) {
    const archived = files.get(`package/dist/templates/default/v1/${name}/${path}`);
    assert.ok(archived, `Missing packed skill: ${name}/${path}`);
    assert.equal(hash(await archived.bytes()), hash(await readFile(join(base, path))));
    checked++;
  }
  assert.ok(checked > 1);
  templates.push({ name, skillFiles: checked, matched: true });
}
const actual = await templateDigest(join(repository, "templates/default/v1/minimal"));
const recorded = CREATE_CAPABILITY_TABLE.entries[0]!.templateDigest;
const result = {
  archiveHashesVerified: index.packages.length,
  templates,
  certification: {
    currentTemplateDigest: actual,
    recordedTemplateDigest: recorded,
    current: actual === recorded,
  },
};
await writeFile(
  join(import.meta.dir, "identity-results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
