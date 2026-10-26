/** Reproduces the failed npm security update against real Git history, including archived evidence and the owning Bun catalog. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeDependencies } from "../../scripts/dependency-update.ts";
import { withAutomationRepository } from "./pr-automation-fixture.ts";

test("normalization promotes Next/Zod, preserves independent MySQL pins and restores evidence idempotently", async () => {
  const archived = "openspec/changes/archive/example/app/package.json";
  const rootManifest = {
    name: "workspace",
    catalog: { next: "16.3.8", zod: "4.6.5" },
    scripts: { check: "keep this command" },
  };
  const original = JSON.stringify({ dependencies: { next: "16.3.8" } }) + "\n";
  await withAutomationRepository(
    {
      "package.json": JSON.stringify(rootManifest),
      [archived]: original,
      "templates/default/v1/fullstack/package.json": original,
      "packages/drizzle/package.json": JSON.stringify({
        dependencies: { zod: "4.6.5" },
        devDependencies: { mysql2: "3.14.1" },
      }),
    },
    async ({ root, base, git, write, commit }) => {
      const updated = JSON.stringify({ dependencies: { next: "16.4.1" } }) + "\n";
      await write(archived, updated);
      await write("templates/default/v1/fullstack/package.json", updated);
      await write(
        "packages/drizzle/package.json",
        JSON.stringify({ dependencies: { zod: "4.6.6" }, devDependencies: { mysql2: "3.23.1" } }),
      );
      commit();
      const signal = new AbortController().signal;
      await normalizeDependencies(root, base, signal);
      const normalized = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      expect(normalized).toEqual({ ...rootManifest, catalog: { next: "16.4.1", zod: "4.6.6" } });
      expect(await readFile(join(root, archived), "utf8")).toBe(original);
      expect(
        JSON.parse(await readFile(join(root, "packages/drizzle/package.json"), "utf8")),
      ).toMatchObject({ devDependencies: { mysql2: "3.23.1" } });
      const first = git("diff");
      await normalizeDependencies(root, base, signal);
      expect(git("diff")).toBe(first);
    },
  );
});

test.each(["root", "workspace", "both"])(
  "%s updates retain their catalog ownership",
  async (owner) => {
    const initial = {
      name: "workspace",
      catalog: { next: "16.3.8" },
      devDependencies: { next: "catalog:" },
    };
    await withAutomationRepository(
      {
        "package.json": JSON.stringify(initial),
        "apps/docs/package.json": JSON.stringify({ dependencies: { next: "catalog:" } }),
      },
      async ({ root, base, write, commit }) => {
        if (owner !== "workspace")
          await write(
            "package.json",
            JSON.stringify({ ...initial, devDependencies: { next: "16.4.1" } }),
          );
        if (owner !== "root")
          await write(
            "apps/docs/package.json",
            JSON.stringify({ dependencies: { next: "16.4.1" } }),
          );
        commit();
        await normalizeDependencies(root, base, new AbortController().signal);
        expect(JSON.parse(await readFile(join(root, "package.json"), "utf8"))).toEqual({
          ...initial,
          catalog: { next: "16.4.1" },
        });
        expect(JSON.parse(await readFile(join(root, "apps/docs/package.json"), "utf8"))).toEqual({
          dependencies: { next: "catalog:" },
        });
      },
    );
  },
);
