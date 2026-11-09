/** Keeps the README, landing page, docs index and npm descriptions on the one positioning sentence. */
import { afterAll, expect, test } from "bun:test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  POSITIONING,
  positioningMismatches,
  readLocalSurfaces,
} from "../../scripts/positioning.ts";

const root = resolve(import.meta.dir, "../..");
const surfaceFiles = [
  "README.md",
  "apps/docs/components/landing/hero.tsx",
  "apps/docs/pages/index.astro",
  "apps/docs/content/docs/index.mdx",
  "packages/relkit/package.json",
  "packages/create-relkit/package.json",
];
const fixture = await mkdtemp(join(tmpdir(), "relkit-positioning-"));

afterAll(() => rm(fixture, { recursive: true, force: true }));

test("every checked-in surface uses the positioning sentence", async () => {
  const surfaces = await readLocalSurfaces(root);
  expect(surfaces.map(({ name }) => name)).toEqual([
    "README opening",
    "landing hero",
    "landing description",
    "docs index",
    "npm description of relkit",
    "npm description of create-relkit",
  ]);
  expect(positioningMismatches(surfaces)).toEqual([]);
});

test("a mismatched fixture fails the check", async () => {
  for (const file of surfaceFiles) await cp(join(root, file), join(fixture, file));
  await writeFile(
    join(fixture, "README.md"),
    "# RelKit\n\nA Bun and TypeScript monorepo for generating applications.\n\n## Install\n",
  );
  await writeFile(
    join(fixture, "packages/relkit/package.json"),
    JSON.stringify({ name: "relkit", description: `${POSITIONING} ` }),
  );
  await writeFile(
    join(fixture, "packages/create-relkit/package.json"),
    JSON.stringify({ name: "create-relkit", description: "Create a RelKit application." }),
  );
  expect(positioningMismatches(await readLocalSurfaces(fixture))).toEqual([
    "README opening",
    "npm description of create-relkit",
  ]);
});

test("descriptions must equal the sentence while page regions may surround it", () => {
  const surfaces = [
    {
      name: "page",
      text: `Intro.\n${POSITIONING.replace(" RelKit", "\nRelKit")}`,
      match: "contains",
    },
    { name: "missing", text: undefined, match: "equals" },
    { name: "GitHub description", text: `${POSITIONING} Star us.`, match: "equals" },
  ] as const;
  expect(positioningMismatches(surfaces)).toEqual(["missing", "GitHub description"]);
});
