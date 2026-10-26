/** Exercises real Changesets against isolated manifests, with explicit certification and documentation stubs, so independent release versions and read-only planning remain observable. */
import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  nextReleaseVersion,
  selectReleasePackages,
  validateReleasePlan,
} from "../../scripts/release-plan.ts";

test("batch identities remain unique when separate packages reach the same version", () => {
  expect(nextReleaseVersion("## Unreleased\n\n## 0.7.10\n")).toBe("0.7.11");
  const plan = validateReleasePlan({
    protocol: "relkit.release-plan.v1",
    version: "0.7.11",
    packages: [{ name: "@relkit/sentry", version: "0.7.10" }],
  });
  expect(
    selectReleasePackages(
      [
        { name: "@relkit/sentry", manifest: { version: "0.7.10" } },
        { name: "relkit", manifest: { version: "0.7.9" } },
      ],
      plan,
    ),
  ).toHaveLength(1);
  expect(() =>
    selectReleasePackages([{ name: "@relkit/sentry", manifest: { version: "0.7.11" } }], plan),
  ).toThrow("Release version changed");
  expect(() =>
    validateReleasePlan({ ...plan, packages: [...plan.packages, ...plan.packages] }),
  ).toThrow("Duplicate release package");
});

test("real Changesets versions only the generator and its two dependents", async () => {
  const root = resolve(import.meta.dir, "../..");
  const fixture = await mkdtemp(join(tmpdir(), "relkit-scoped-version-"));
  try {
    execFileSync("git", ["init", "-b", "main", fixture], { stdio: "ignore" });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Release Test",
        "-c",
        "user.email=release@example.test",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "--allow-empty",
        "-m",
        "fixture",
      ],
      { cwd: fixture, stdio: "ignore" },
    );
    for (const directory of ["scripts", ".changeset", "node_modules/@changesets"])
      await mkdir(join(fixture, directory), { recursive: true });
    await symlink(
      join(root, "node_modules/@changesets/cli"),
      join(fixture, "node_modules/@changesets/cli"),
    );
    await symlink(
      join(root, "packages/create-relkit"),
      join(fixture, "node_modules/create-relkit"),
    );
    for (const file of [
      "version-packages.ts",
      "workspace-packages.ts",
      "release-plan.ts",
      "release-templates.ts",
      "catalog-manifest.ts",
      "catalog-manifest.types.ts",
    ])
      await copyFile(join(root, "scripts", file), join(fixture, "scripts", file));
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify({
        name: "scoped-fixture",
        private: true,
        type: "module",
        packageManager: "bun@1.3.10",
        workspaces: ["packages/*"],
        scripts: { "version:docs": "bun scripts/version-docs.ts" },
      }),
    );
    await copyFile(join(root, ".changeset/config.json"), join(fixture, ".changeset/config.json"));
    for (const [name, version, dependencies] of [
      ["create-relkit", "0.7.9", {}],
      ["@relkit/cli", "0.8.0", { "create-relkit": "workspace:*" }],
      ["relkit", "0.8.0", { "@relkit/cli": "workspace:*" }],
      ["@relkit/sentry", "0.7.9", {}],
      ["@relkit/redis", "0.7.9", {}],
    ] as const) {
      const directory = join(fixture, "packages", name.replace("@relkit/", ""));
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ name, version, dependencies }),
      );
    }
    for (const template of ["minimal", "api", "agent", "tasks", "fullstack"]) {
      const directory = join(fixture, "templates/default/v1", template);
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ devDependencies: { "@relkit/cli": "0.8.0" } }),
      );
    }
    await writeFile(join(fixture, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## 0.7.9\n");
    await writeFile(
      join(fixture, ".changeset/generator.md"),
      '---\n"create-relkit": patch\n---\n\nUpdate bundled skills.\n',
    );
    // This exercises real Changesets and lockfile generation; expensive certification is a separate gate.
    await writeFile(join(fixture, "scripts/sync-release.ts"), "");
    await writeFile(
      join(fixture, "scripts/certify-create.ts"),
      'await Bun.write("certified", "yes");',
    );
    await writeFile(join(fixture, "scripts/release-check.ts"), "");
    await writeFile(
      join(fixture, "scripts/version-docs.ts"),
      'await Bun.write("documented", await Bun.file("packages/create-relkit/package.json").text());',
    );
    const lock = Bun.spawn([process.execPath, "install", "--lockfile-only", "--ignore-scripts"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [lockCode, lockOut, lockError] = await Promise.all([
      lock.exited,
      new Response(lock.stdout).text(),
      new Response(lock.stderr).text(),
    ]);
    expect(lockCode, lockOut + lockError).toBe(0);
    execFileSync("git", ["checkout", "--detach", "HEAD"], { cwd: fixture, stdio: "ignore" });
    execFileSync("git", ["branch", "-D", "main"], { cwd: fixture, stdio: "ignore" });
    const detached = Bun.spawn([process.execPath, "scripts/version-packages.ts", "--check"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [detachedCode, detachedOut, detachedError] = await Promise.all([
      detached.exited,
      new Response(detached.stdout).text(),
      new Response(detached.stderr).text(),
    ]);
    expect(detachedCode).not.toBe(0);
    expect(detachedOut + detachedError).toContain('HEAD diverged from "main"');
    const workflow = Bun.YAML.parse(await readFile(join(root, ".github/workflows/ci.yml"), "utf8"));
    const restore = workflow.jobs.version.steps.find(
      (step: { name?: string }) => step.name === "Restore the local Changesets base branch",
    );
    expect(restore).toBeDefined();
    const versionStep = workflow.jobs.version.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("changesets/action/version@"),
    );
    expect(workflow.jobs.version.steps.indexOf(restore)).toBeLessThan(
      workflow.jobs.version.steps.indexOf(versionStep),
    );
    execFileSync("sh", ["-c", restore.run], {
      cwd: fixture,
      env: {
        ...process.env,
        GITHUB_SHA: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: fixture,
          encoding: "utf8",
        }).trim(),
      },
      stdio: "ignore",
    });
    execFileSync(process.execPath, ["scripts/version-packages.ts", "--check"], { cwd: fixture });
    expect(await Bun.file(join(fixture, "documented")).exists()).toBe(false);
    const child = Bun.spawn([process.execPath, "scripts/version-packages.ts"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code, stdout + stderr).toBe(0);
    const plan = JSON.parse(await readFile(join(fixture, ".changeset/release.json"), "utf8"));
    expect(
      plan.packages.toSorted((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name),
      ),
    ).toEqual([
      { name: "@relkit/cli", version: "0.8.1" },
      { name: "create-relkit", version: "0.7.10" },
      { name: "relkit", version: "0.8.1" },
    ]);
    expect(
      JSON.parse(await readFile(join(fixture, "packages/sentry/package.json"), "utf8")).version,
    ).toBe("0.7.9");
    expect(await readFile(join(fixture, "certified"), "utf8")).toBe("yes");
    expect(JSON.parse(await readFile(join(fixture, "documented"), "utf8")).version).toBe("0.7.10");
    await rm(join(fixture, "certified"));
    await writeFile(
      join(fixture, ".changeset/sentry.md"),
      '---\n"@relkit/sentry": patch\n---\n\nUpdate telemetry.\n',
    );
    const again = Bun.spawn([process.execPath, "scripts/version-packages.ts"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [againCode, againOut, againError] = await Promise.all([
      again.exited,
      new Response(again.stdout).text(),
      new Response(again.stderr).text(),
    ]);
    expect(againCode, againOut + againError).toBe(0);
    const telemetryPlan = JSON.parse(
      await readFile(join(fixture, ".changeset/release.json"), "utf8"),
    );
    expect(telemetryPlan.version).toBe("0.7.11");
    expect(telemetryPlan.packages).toEqual([{ name: "@relkit/sentry", version: "0.7.10" }]);
    expect(await Bun.file(join(fixture, "certified")).exists()).toBe(false);
    await writeFile(
      join(fixture, ".changeset/cli.md"),
      '---\n"@relkit/cli": patch\n---\n\nUpdate CLI.\n',
    );
    const cli = Bun.spawn([process.execPath, "scripts/version-packages.ts"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [cliCode, cliOut, cliError] = await Promise.all([
      cli.exited,
      new Response(cli.stdout).text(),
      new Response(cli.stderr).text(),
    ]);
    expect(cliCode, cliOut + cliError).toBe(0);
    const cliPlan = JSON.parse(await readFile(join(fixture, ".changeset/release.json"), "utf8"));
    expect(cliPlan.packages.map((item: { name: string }) => item.name).sort()).toEqual([
      "@relkit/cli",
      "create-relkit",
      "relkit",
    ]);
    expect(await readFile(join(fixture, "certified"), "utf8")).toBe("yes");
    await rm(join(fixture, "certified"));
    await writeFile(
      join(fixture, ".changeset/redis.md"),
      '---\n"@relkit/redis": patch\n---\n\nUpdate optional scaffold dependency.\n',
    );
    execFileSync(process.execPath, ["scripts/version-packages.ts"], { cwd: fixture });
    const providerPlan = JSON.parse(
      await readFile(join(fixture, ".changeset/release.json"), "utf8"),
    );
    expect(providerPlan.packages.map((item: { name: string }) => item.name).sort()).toEqual([
      "@relkit/cli",
      "@relkit/redis",
      "create-relkit",
      "relkit",
    ]);
    expect(await readFile(join(fixture, "certified"), "utf8")).toBe("yes");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 30_000);
