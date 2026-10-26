/** Runs the real selector against isolated Git history and a deterministic gh boundary; every temporary checkout is removed. */
import { execFileSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ReleaseFixtureState } from "./release-selection.types.js";

const repositoryRoot = resolve(import.meta.dir, "../..");

/**
 * Copies only executable selector dependencies, sharing installed libraries as read-only inputs.
 * @param root - Fresh temporary repository.
 * @returns Completion after the native fake boundary is executable.
 */
async function copySelector(root: string) {
  for (const directory of ["scripts/dev-readiness", ".changeset", "bin"])
    await mkdir(join(root, directory), { recursive: true });
  for (const file of [
    "select-release.ts",
    "release-plan.ts",
    "release-recovery.ts",
    "release-source.ts",
    "release-automation.schemas.ts",
    "release-automation.types.ts",
    "release-ci-verification.ts",
    "release-ci-verification.types.ts",
    "pr-automation-io.ts",
    "dev-readiness/benchmark-main.ts",
  ])
    await copyFile(join(repositoryRoot, "scripts", file), join(root, "scripts", file));
  await symlink(join(repositoryRoot, "node_modules"), join(root, "node_modules"));
  await writeFile(
    join(root, "bin/gh"),
    `#!${process.execPath}\n` +
      (await readFile(join(import.meta.dir, "release-github.ts"), "utf8")),
  );
  await chmod(join(root, "bin/gh"), 0o755);
}

/**
 * Creates real committed snapshots so ancestry and batch introduction are exercised by Git.
 * @returns Fixture operations; the caller owns removal through withReleaseFixture.
 */
async function createReleaseFixture() {
  const root = await mkdtemp(join(tmpdir(), "relkit-release-selection-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-b", "main");
  git("remote", "add", "origin", root);
  const commit = () => {
    git("add", ".changeset");
    git(
      "-c",
      "user.name=Test",
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
    );
    return git("rev-parse", "HEAD");
  };
  await copySelector(root);
  await writeFile(join(root, ".changeset/empty.md"), "---\n---\n\nNo public change.\n");
  commit();
  const change = () =>
    writeFile(join(root, ".changeset/change.md"), '---\n"create-relkit": patch\n---\n\nChanged.\n');
  const plan = async (version = "0.7.10") => {
    await rm(join(root, ".changeset/change.md"), { force: true });
    await writeFile(
      join(root, ".changeset/release.json"),
      JSON.stringify({
        protocol: "relkit.release-plan.v1",
        version,
        packages: [{ name: "create-relkit", version }],
      }),
    );
    return commit();
  };
  const run = (
    state: ReleaseFixtureState = {},
    env: Record<string, string> = {},
    args: string[] = [],
  ) => runSelector(root, { sha: git("rev-parse", "HEAD"), ...state }, env, args);
  return { root, git, commit, change, plan, run };
}

/**
 * Invokes the actual executable with credentials replaced by fixture state.
 * @param root - Temporary repository.
 * @param state - Simulated server evidence.
 * @param env - Explicit workflow context overrides.
 * @param args - Selector or reconciliation CLI arguments.
 * @returns Exit code, exact stdout and diagnostics, plus recorded dispatch arguments.
 */
async function runSelector(
  root: string,
  state: ReleaseFixtureState,
  env: Record<string, string>,
  args: string[],
) {
  await writeFile(join(root, "state.json"), JSON.stringify(state));
  await writeFile(join(root, "calls.jsonl"), "");
  const child = Bun.spawn([process.execPath, "scripts/select-release.ts", ...args], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      STATE: join(root, "state.json"),
      CALLS: join(root, "calls.jsonl"),
      GITHUB_REPOSITORY: "rel-kit/relkit",
      RECOVERY_RUN_ID: "",
      PUBLISHED_SOURCE_SHA: "",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, output, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return {
    code,
    output,
    diagnostics: output + stderr,
    calls: await readFile(join(root, "calls.jsonl"), "utf8"),
  };
}

/**
 * Owns fixture cleanup even when an assertion or subprocess fails.
 * @param check - Test behavior using the isolated real selector.
 * @returns Physical completion after temporary files are removed.
 */
export async function withReleaseFixture(
  check: (fixture: Awaited<ReturnType<typeof createReleaseFixture>>) => Promise<void>,
) {
  const fixture = await createReleaseFixture();
  try {
    await check(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}
