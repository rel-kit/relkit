/** Keeps the README, CONTRIBUTING and the writing standard linked to files that exist. */
import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brokenRepositoryLinks } from "../scripts/check-repository-links.js";

const fixture = await mkdtemp(join(tmpdir(), "relkit-repository-links-"));
afterAll(() => rm(fixture, { recursive: true, force: true }));

test("root pages link to existing files, including the writing standard", () => {
  const root = resolve(import.meta.dir, "../../..");
  expect(brokenRepositoryLinks(root)).toEqual([]);
  expect(Bun.file(join(root, "CONTRIBUTING.md")).text()).resolves.toContain("](WRITING.md)");
});

test("a missing target is reported with its page", async () => {
  await writeFile(join(fixture, "WRITING.md"), "# Writing\n");
  await writeFile(
    join(fixture, "CONTRIBUTING.md"),
    "See the [standard](WRITING.md), [site](https://relkit.dev) and [gone](docs/missing.md#a).\n",
  );
  expect(brokenRepositoryLinks(fixture, ["CONTRIBUTING.md"])).toEqual([
    "CONTRIBUTING.md: docs/missing.md",
  ]);
});
