import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ADD_FAILURE_CODES } from "../src/add-types.js";
import { mergeScaffoldManifest } from "../src/plan-manifest.js";
import { resolveProjectDependencies } from "../src/project-catalog.js";
import { SCAFFOLD_DEPENDENCIES } from "../src/scaffold-catalog.js";
import { patchBuilder, withProject } from "./dependency-patches.fixture.js";

test("resolves default and named workspace catalogs while retaining authored aliases", async () => {
  await withProject(async (root) => {
    const version = SCAFFOLD_DEPENDENCIES["drizzle-orm"].version;
    const project = join(root, "packages/example");
    await mkdir(project, { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        workspaces: ["packages/*"],
        catalog: { "drizzle-orm": version },
        catalogs: { sql: { "drizzle-orm": version } },
      }),
    );
    for (const specification of ["catalog:", "catalog:sql"]) {
      const source = JSON.stringify({ dependencies: { "drizzle-orm": specification } });
      await writeFile(join(project, "package.json"), source);
      const resolved = await resolveProjectDependencies(project, { "drizzle-orm": specification });
      expect(resolved).toEqual({ "drizzle-orm": version });
      const merged = mergeScaffoldManifest(source, new Set(["drizzle-orm"]), new Map(), resolved);
      expect(JSON.parse(merged.content).dependencies["drizzle-orm"]).toBe(specification);
      expect(merged.added).toEqual({});
      const plan = await patchBuilder(project).finish();
      expect(plan.dependencies).toEqual({});
      const manifestOperation = plan.operations.find(
        (operation) => operation.path === "package.json",
      );
      if (manifestOperation === undefined)
        throw new Error("Patch registration must update the manifest.");
      expect(JSON.parse(manifestOperation.content).dependencies["drizzle-orm"]).toBe(specification);
    }
  });
});

test("supports Bun's nested catalog layout without changing concrete specifications", async () => {
  await withProject(async (root) => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ workspaces: { packages: [], catalog: { example: "1.2.3" } } }),
    );
    expect(
      await resolveProjectDependencies(root, { example: "catalog:", unchanged: "2.0.0" }),
    ).toEqual({
      example: "1.2.3",
      unchanged: "2.0.0",
    });
  });
});

test("missing catalog owners, groups and entries fail explicitly before patch planning", async () => {
  for (const catalog of [undefined, {}, { different: "1.0.0" }]) {
    await withProject(async (root) => {
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({
          dependencies: { "drizzle-orm": "catalog:" },
          ...(catalog ? { catalog } : {}),
        }),
      );
      const before = await readFile(join(root, "package.json"));
      await expect(patchBuilder(root).finish()).rejects.toMatchObject({
        code: ADD_FAILURE_CODES.invalidProject,
      });
      expect(await readFile(join(root, "package.json"))).toEqual(before);
    });
  }
  await withProject(async (root) => {
    await writeFile(join(root, "package.json"), JSON.stringify({ catalog: { example: "1.0.0" } }));
    await expect(
      resolveProjectDependencies(root, { example: "catalog:missing" }),
    ).rejects.toMatchObject({
      code: ADD_FAILURE_CODES.invalidProject,
    });
  });
});

test("a catalog value conflicting with the supported version is rejected without replacing its alias", async () => {
  await withProject(async (root) => {
    const source = JSON.stringify({
      catalog: { "drizzle-orm": "0.0.0" },
      dependencies: { "drizzle-orm": "catalog:" },
    });
    await writeFile(join(root, "package.json"), source);
    await expect(patchBuilder(root).finish()).rejects.toMatchObject({
      code: ADD_FAILURE_CODES.collision,
    });
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(source);
  });
});

test("catalog entries cannot hide recursive, workspace, link, file, network or path declarations", async () => {
  for (const entry of [
    "catalog:other",
    "workspace:*",
    "link:example",
    "file:./example",
    "https://example.test/package.tgz",
    "./example",
    "/tmp/example",
  ]) {
    await withProject(async (root) => {
      await writeFile(join(root, "package.json"), JSON.stringify({ catalog: { example: entry } }));
      await expect(resolveProjectDependencies(root, { example: "catalog:" })).rejects.toMatchObject(
        {
          code: ADD_FAILURE_CODES.invalidProject,
        },
      );
    });
  }
});
