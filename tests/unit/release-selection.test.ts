import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("real selector skips empty changesets, reuses archives, and recovers after main advances", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-release-selection-"));
  try {
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: fixture, encoding: "utf8" }).trim();
    git("init", "-b", "main");
    const commit = () =>
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
    commit();
    for (const directory of ["scripts", ".changeset", "bin"]) await mkdir(join(fixture, directory));
    for (const file of ["select-release.ts", "release-plan.ts", "release-recovery.ts"])
      await copyFile(
        resolve(import.meta.dir, "../../scripts", file),
        join(fixture, "scripts", file),
      );
    const gh = join(fixture, "bin/gh");
    const statePath = join(fixture, "state.json");
    await writeFile(
      gh,
      `#!${process.execPath}\n` +
        String.raw`
      import { readFileSync } from "node:fs";
      const state = JSON.parse(readFileSync(process.env.STATE, "utf8"));
      const args = process.argv.slice(2);
      const path = args.at(-1);
      let result;
      if (args[1] === "graphql") result = { data: { repository: { release: state.complete ? { isDraft: false } : null } } };
      else if (path.includes("/actions/workflows/")) result = { workflow_runs: state.previous ? [{ id: 42, head_sha: state.sha, status: "completed" }] : [] };
      else if (path.includes("/jobs")) result = { jobs: [{ name: "Build validated npm artifacts", conclusion: "success" }] };
      else if (path.includes("/artifacts")) result = { artifacts: [{ id: 123, name: "npm-release-" + state.sha, expired: !!state.expired }] };
      else result = { path: ".github/workflows/ci.yml", head_branch: "main", head_sha: state.sha, event: "workflow_dispatch", status: "completed", head_repository: { full_name: "rel-kit/relkit" } };
      console.log(JSON.stringify(result));
    `,
    );
    await chmod(gh, 0o755);
    let sha = git("rev-parse", "HEAD");
    const run = async (state: Record<string, unknown> = {}, env: Record<string, string> = {}) => {
      await writeFile(statePath, JSON.stringify({ sha, ...state }));
      const outputPath = join(fixture, "outputs");
      await writeFile(outputPath, "");
      const child = Bun.spawn([process.execPath, "scripts/select-release.ts"], {
        cwd: fixture,
        env: {
          ...process.env,
          PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
          STATE: statePath,
          GITHUB_REPOSITORY: "rel-kit/relkit",
          GITHUB_RUN_ID: "44",
          GITHUB_OUTPUT: outputPath,
          VERIFIED_SHA: sha,
          RECOVERY_RUN_ID: "",
          ...env,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, diagnostics: stdout + stderr, output: await readFile(outputPath, "utf8") };
    };
    await writeFile(join(fixture, ".changeset/empty.md"), "---\n---\n\nNo public change.\n");
    expect((await run()).output).toContain("mode=none");
    await writeFile(
      join(fixture, ".changeset/change.md"),
      '---\n"create-relkit": patch\n---\n\nChanged.\n',
    );
    expect((await run()).output).toContain("mode=version");
    await rm(join(fixture, ".changeset/change.md"));
    await writeFile(
      join(fixture, ".changeset/release.json"),
      JSON.stringify({
        protocol: "relkit.release-plan.v1",
        version: "0.7.10",
        packages: [{ name: "create-relkit", version: "0.7.10" }],
      }),
    );
    git("add", ".changeset/release.json");
    commit();
    sha = git("rev-parse", "HEAD");
    const fresh = await run();
    expect(fresh.code, fresh.diagnostics).toBe(0);
    expect(fresh.output).toContain("mode=publish");
    expect((await run({ previous: true })).output).toContain("mode=recover");
    expect((await run({ complete: true })).output).toContain("mode=none");
    await writeFile(join(fixture, "docs.md"), "later commit");
    git("add", "docs.md");
    commit();
    const advanced = git("rev-parse", "HEAD");
    expect((await run()).output).toContain("mode=none");
    const refused = await run({}, { VERIFIED_SHA: advanced });
    expect(refused.code).not.toBe(0);
    expect(refused.diagnostics).toContain("original archives");
    const recovered = await run({}, { RECOVERY_RUN_ID: "42", VERIFIED_SHA: "" });
    expect(recovered.code, recovered.diagnostics).toBe(0);
    expect(recovered.output).toContain(`mode=recover\nsha=${sha}\nartifact_id=123`);
    const expired = await run({ expired: true }, { RECOVERY_RUN_ID: "42" });
    expect(expired.code).not.toBe(0);
    expect(expired.diagnostics).toContain("expired");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 30_000);
