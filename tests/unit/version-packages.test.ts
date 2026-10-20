import { expect, test } from "bun:test";
import { renderActionChangelog, renderChangelog } from "../../scripts/version-packages.ts";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("the release train promotes Unreleased into one root changelog entry", () => {
  expect(
    renderChangelog(
      "# Changelog\n\n## Unreleased — Breaking\n\n- Existing change.\n\n## 0.0.0\n\n- Bootstrap.\n",
      "0.0.1",
      ["New public API.", "Existing change."],
    ),
  ).toBe(
    "# Changelog\n\n## Unreleased\n\n## 0.0.1 — Breaking\n\n- Existing change.\n\n### Changes\n\n- New public API.\n\n## 0.0.0\n\n- Bootstrap.\n",
  );
});

test("the Changesets action receives an untracked package changelog", () => {
  expect(renderActionChangelog("@relkit/app", "0.0.1")).toBe(
    "# @relkit/app\n\n## 0.0.1\n\nSee the root CHANGELOG.md for this release batch.\n",
  );
});

test("versioning stops before release notes when new-version certification fails", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-version-certification-"));
  try {
    await mkdir(join(fixture, "scripts"));
    for (const file of [
      "version-packages.ts",
      "workspace-packages.ts",
      "release-plan.ts",
      "release-templates.ts",
      "catalog-manifest.ts",
      "catalog-manifest.types.ts",
    ])
      await copyFile(
        resolve(import.meta.dir, "../../scripts", file),
        join(fixture, "scripts", file),
      );
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify({ name: "version-fixture", private: true, type: "module" }),
    );
    await writeFile(
      join(fixture, "CHANGELOG.md"),
      "# Changelog\n\n## Unreleased\n\n- Change.\n\n## 0.0.0\n",
    );
    await mkdir(join(fixture, ".changeset"));
    await mkdir(join(fixture, "node_modules/create-relkit"), { recursive: true });
    for (const file of ["catalog-resolution.ts", "catalog-resolution.types.ts"])
      await copyFile(
        resolve(import.meta.dir, "../../packages/create-relkit/src", file),
        join(fixture, "node_modules/create-relkit", file),
      );
    await writeFile(
      join(fixture, "node_modules/create-relkit/package.json"),
      JSON.stringify({
        name: "create-relkit",
        exports: { "./catalog-resolution": "./catalog-resolution.ts" },
      }),
    );
    for (const name of ["minimal", "api", "agent", "tasks", "fullstack"]) {
      await mkdir(join(fixture, "templates/default/v1", name), { recursive: true });
      await writeFile(join(fixture, "templates/default/v1", name, "package.json"), "{}");
    }
    await mkdir(join(fixture, "node_modules/@changesets/cli"), { recursive: true });
    await writeFile(
      join(fixture, "node_modules/@changesets/cli/bin.js"),
      `
      if (process.argv.includes("status")) await Bun.write(process.argv.at(-1), JSON.stringify({
        changesets: [{ summary: "Change." }], releases: [{ name: "create-relkit", newVersion: "9.9.9" }]
      }));
    `,
    );
    await writeFile(join(fixture, "scripts/sync-release.ts"), 'await Bun.write("synced", "yes");');
    await writeFile(
      join(fixture, "scripts/certify-create.ts"),
      'await Bun.write("certified", await Bun.file("synced").text()); process.exit(1);',
    );
    await writeFile(
      join(fixture, "scripts/release-check.ts"),
      'await Bun.write("RELEASE_NOTES.md", "must not run");',
    );
    const child = Bun.spawn([process.execPath, "scripts/version-packages.ts"], {
      cwd: fixture,
      env: { ...process.env, GITHUB_ACTIONS: "true" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, , stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("scripts/certify-create.ts");
    expect(await readFile(join(fixture, "certified"), "utf8")).toBe("yes");
    expect(await Bun.file(join(fixture, "RELEASE_NOTES.md")).exists()).toBe(false);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
