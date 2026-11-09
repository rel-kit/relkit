/** Exercises real Changesets against isolated manifests, with explicit certification and documentation stubs, so the fixed release version and read-only planning remain observable. */
import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  selectReleasePackages,
  sharedReleaseVersion,
  validateReleasePlan,
} from "../../scripts/release-plan.ts";

const root = resolve(import.meta.dir, "../..");

test("a release plan has one version shared by every package", () => {
  expect(
    sharedReleaseVersion([
      { name: "relkit", version: "0.9.0" },
      { name: "@relkit/sentry", version: "0.9.0" },
    ]),
  ).toBe("0.9.0");
  expect(() =>
    sharedReleaseVersion([
      { name: "relkit", version: "0.9.0" },
      { name: "@relkit/sentry", version: "0.8.4" },
    ]),
  ).toThrow("Release packages must share one version: relkit@0.9.0, @relkit/sentry@0.8.4");
  const plan = validateReleasePlan({
    protocol: "relkit.release-plan.v1",
    version: "0.9.0",
    packages: [{ name: "@relkit/sentry", version: "0.9.0" }],
  });
  expect(
    selectReleasePackages([{ name: "@relkit/sentry", manifest: { version: "0.9.0" } }], plan),
  ).toHaveLength(1);
  expect(() =>
    selectReleasePackages([{ name: "@relkit/sentry", manifest: { version: "0.9.1" } }], plan),
  ).toThrow("Release version changed");
  expect(() =>
    validateReleasePlan({ ...plan, packages: [...plan.packages, ...plan.packages] }),
  ).toThrow("Duplicate release package");
});

test("one fixed Changesets group covers relkit, create-relkit and every @relkit package", async () => {
  const config = JSON.parse(await readFile(join(root, ".changeset/config.json"), "utf8"));
  expect(config.fixed).toEqual([["relkit", "create-relkit", "@relkit/*"]]);
  expect(config.linked).toEqual([]);
});

test("the GitHub release tag is the version recorded in the release manifest", async () => {
  const workflow = Bun.YAML.parse(await readFile(join(root, ".github/workflows/ci.yml"), "utf8"));
  const publish = Object.values(
    workflow.jobs as Record<string, { steps?: { name?: string; run?: string }[] }>,
  )
    .flatMap((job) => job.steps ?? [])
    .find((step) => step.name === "Publish the immutable GitHub release");
  expect(publish?.run).toContain('version="$(jq -r .version npm-release/manifest.json)"');
  expect(publish?.run).toContain('tag="v$version"');
  const check = await readFile(join(root, "scripts/release-check.ts"), "utf8");
  expect(check).toContain("const version = plan?.version ?? checked.version;");
});

test("a dry-run version bump gives every package the same version", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-fixed-version-"));
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
    for (const file of ["version-packages.ts", "workspace-packages.ts", "release-plan.ts"])
      await copyFile(join(root, "scripts", file), join(fixture, "scripts", file));
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify({
        name: "fixed-fixture",
        private: true,
        type: "module",
        packageManager: "bun@1.3.10",
        workspaces: ["packages/*"],
        scripts: { "version:docs": "bun scripts/version-docs.ts" },
      }),
    );
    await copyFile(join(root, ".changeset/config.json"), join(fixture, ".changeset/config.json"));
    const published = [
      ["create-relkit", "0.7.9", {}],
      ["@relkit/cli", "0.8.0", { "create-relkit": "workspace:*" }],
      ["relkit", "0.8.0", { "@relkit/cli": "workspace:*" }],
      ["@relkit/sentry", "0.7.9", { relkit: "workspace:*" }],
      ["@relkit/redis", "0.7.9", {}],
    ] as const;
    for (const [name, version, dependencies] of published) {
      const directory = join(fixture, "packages", name.replace("@relkit/", ""));
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ name, version, dependencies }),
      );
    }
    await mkdir(join(fixture, "packages/docs"), { recursive: true });
    await writeFile(
      join(fixture, "packages/docs/package.json"),
      JSON.stringify({ name: "@relkit/docs", version: "0.0.0", private: true }),
    );
    await writeFile(join(fixture, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## 0.7.9\n");
    await writeFile(
      join(fixture, ".changeset/sentry.md"),
      '---\n"@relkit/sentry": patch\n---\n\nUpdate telemetry.\n',
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
    // Changesets logs before the plan; the plan is the last line.
    const dryRun = JSON.parse(
      execFileSync(process.execPath, ["scripts/version-packages.ts", "--check"], {
        cwd: fixture,
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .at(-1)!,
    );
    expect(dryRun.version).toBe("0.8.1");
    expect(new Set(dryRun.packages.map(({ version }: { version: string }) => version))).toEqual(
      new Set(["0.8.1"]),
    );
    expect(dryRun.packages.map(({ name }: { name: string }) => name).sort()).toEqual(
      published.map(([name]) => name).sort(),
    );
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
    expect(plan).toEqual(dryRun);
    for (const [name] of published) {
      const directory = join(fixture, "packages", name.replace("@relkit/", ""));
      const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      expect(manifest.version, name).toBe("0.8.1");
    }
    expect(
      JSON.parse(await readFile(join(fixture, "packages/docs/package.json"), "utf8")).version,
    ).toBe("0.0.0");
    expect(await readFile(join(fixture, "CHANGELOG.md"), "utf8")).toContain("## 0.8.1");
    expect(await readFile(join(fixture, "certified"), "utf8")).toBe("yes");
    expect(JSON.parse(await readFile(join(fixture, "documented"), "utf8")).version).toBe("0.8.1");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 30_000);
