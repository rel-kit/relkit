/** Checks workflow wiring into the required CI and release boundaries; adversarial authority behavior is exercised by the verifier and handoff suites. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("CI gates merges and only verified main commits start releases", async () => {
  const root = resolve(import.meta.dir, "../..");
  const [checks, release, verify, testAll] = await Promise.all([
    readFile(resolve(root, ".github/workflows/checks.yml"), "utf8"),
    readFile(resolve(root, ".github/workflows/ci.yml"), "utf8"),
    readFile(resolve(root, "scripts/verify.ts"), "utf8"),
    readFile(resolve(root, "scripts/test-all.ts"), "utf8"),
  ]);

  expect(checks).toContain("name: CI");
  expect(checks).toContain("name: CI Gate");
  expect(checks).toContain("name: Static checks");
  expect(checks).toContain("name: Types and focused tests");
  expect(checks).toContain("uses: ./.github/workflows/release-readiness.yml");
  expect(checks).toContain('test "$RELEASE_READINESS_RESULT" = success');
  expect(checks).toContain("bun x turbo run typecheck");
  expect(checks).not.toContain('gh workflow run checks.yml --ref "$HEAD_REF"');
  expect(checks).not.toContain("dispatched-branch-status:");
  expect(checks).not.toContain("release-pr-handoff:");
  expect(checks).not.toContain("bun run test:scaffold");
  expect(checks).not.toContain("aws-cloud");
  expect(release).toContain("workflows: [CI]");
  expect(release).toContain("(github.event_name == 'push' && github.ref == 'refs/heads/main') ||");
  expect(release).toContain("github.event.workflow_run.conclusion == 'success'");
  expect(release).toContain("github.event.workflow_run.head_branch == 'main'");
  expect(release).toContain(
    "github.event.workflow_run.head_repository.full_name == github.repository",
  );
  expect(release).toContain('contains(fromJSON(\'["push", "workflow_dispatch"]\')');
  expect(release).toContain("github.ref == 'refs/heads/main'");
  expect(release).toContain("run: bun scripts/release-ci-verification.ts");
  expect(release).toContain("CI_RUN_ID: ${{ inputs.ci_run_id }}");
  expect(release).toContain("VERIFIED_SHA: ${{ inputs.verified_sha }}");
  expect(checks).toContain('gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref main');
  // A status function avoids implicit success() rejecting skipped optional ancestors.
  // Unlike always(), !cancelled() also prevents new dispatch after cancellation.
  const jobs = Bun.YAML.parse(checks).jobs;
  for (const job of ["dispatch-release"]) {
    expect(jobs[job].if).toContain("!cancelled()");
    expect(jobs[job].if).toContain("needs.ci-gate.result == 'success'");
  }
  expect(release).toContain("ref: ${{ github.sha }}");
  expect(release).toContain("needs.select-release-mode.outputs.sha");
  expect(release).toContain("branches: [main]");
  expect(release).not.toContain("bun scripts/release-pr-handoff.ts");
  expect(release).not.toContain("for attempt in {1..120}");
  expect(release).toContain("bun scripts/select-release.ts");
  expect(release).toContain("--ci-pack --output");
  expect(release).toContain("needs.pack.result == 'success'");
  expect(release).not.toContain("aws-cloud");
  expect(release).not.toContain("schedule:");
  expect(verify).toContain('await run("package tests", bun, ["run", "test:packages"]);');
  expect(testAll).toContain('"test:packages"');
});

test("release writes use the App and recovery cannot rebuild its archives", async () => {
  const root = resolve(import.meta.dir, "../..");
  const release = Bun.YAML.parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8"));
  const version = release.jobs.version;
  for (const name of ["version", "pack", "publish"]) {
    const checkout = release.jobs[name].steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("actions/checkout"),
    );
    expect(checkout.with.ref).toBe(
      name === "pack" ? "${{ needs.select-release-mode.outputs.sha }}" : "${{ github.sha }}",
    );
  }
  const packGuard = release.jobs.pack.steps.find(
    (step: { name?: string }) => step.name === "Require the exact verified pack commit",
  );
  expect(packGuard.env.VERIFIED_SHA).toBe("${{ needs.select-release-mode.outputs.sha }}");
  expect(packGuard.run).toContain('git merge-base --is-ancestor "$VERIFIED_SHA" "$GITHUB_SHA"');
  expect(packGuard.run).toContain('test "$(git rev-parse HEAD)" = "$VERIFIED_SHA"');
  const selector = release.jobs["select-release-mode"].steps.find(
    (step: { id?: string }) => step.id === "select",
  );
  expect(selector.run).toBe('bun scripts/select-release.ts >> "$GITHUB_OUTPUT"');
  expect(
    version.steps.find((step: { id: string }) => step.id === "release-app").with,
  ).toMatchObject({
    "client-id": "${{ vars.RELEASE_APP_CLIENT_ID }}",
    "private-key": "${{ secrets.RELEASE_APP_PRIVATE_KEY }}",
    "permission-contents": "write",
    "permission-pull-requests": "write",
  });
  expect(
    version.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("changesets/action/version"),
    ).with["github-token"],
  ).toBe("${{ steps.release-app.outputs.token }}");
  expect(release.jobs.pack.if).toBe("needs.select-release-mode.outputs.mode == 'publish'");
  expect(release.jobs.publish.if).toContain("!cancelled()");
  expect(release.jobs.publish.if).toContain("needs.select-release-mode.outputs.mode == 'recover'");
  const download = release.jobs.publish.steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/download-artifact"),
  );
  expect(download.with["artifact-ids"]).toContain("needs.select-release-mode.outputs.artifact_id");
  expect(download.with["run-id"]).toContain("needs.select-release-mode.outputs.artifact_run_id");
  expect(
    release.jobs.publish.steps.find(
      (step: { name?: string }) =>
        step.name === "Publish missing original archives in dependency order",
    ).env.RELEASE_SHA,
  ).toBe("${{ needs.select-release-mode.outputs.sha }}");
});

test("PR Changeset coverage has no write credentials", async () => {
  const root = resolve(import.meta.dir, "../..");
  const checks = Bun.YAML.parse(
    await readFile(resolve(root, ".github/workflows/checks.yml"), "utf8"),
  );
  expect(JSON.stringify(checks.jobs["auto-changeset"])).not.toContain("RELEASE_APP_PRIVATE_KEY");
  expect(JSON.stringify(checks.jobs["auto-changeset"])).not.toContain("--write");
  expect(checks.jobs["auto-changeset"].permissions).toEqual({ contents: "read" });
});

test("PR code cannot obtain preparation write credentials and rehearsal uses separate clean jobs", async () => {
  const root = resolve(import.meta.dir, "../..");
  const preparation = Bun.YAML.parse(
    await readFile(resolve(root, ".github/workflows/prepare-pr.yml"), "utf8"),
  );
  const rehearsal = Bun.YAML.parse(
    await readFile(resolve(root, ".github/workflows/release-readiness.yml"), "utf8"),
  );
  const steps = preparation.jobs.prepare.steps;
  const checkout = steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/checkout"),
  );
  expect(checkout.with.ref).toBe("main");
  expect(checkout.with["persist-credentials"]).toBe(false);
  expect(preparation.on.workflow_run).toEqual({ workflows: ["CI"], types: ["completed"] });
  const plan = steps.findIndex((step: { id?: string }) => step.id === "plan");
  const app = steps.findIndex((step: { id?: string }) => step.id === "release-app");
  expect(plan).toBeLessThan(app);
  expect(steps[plan].env.GH_TOKEN).toBe("${{ github.token }}");
  expect(steps[app].with["permission-contents"]).toBe("write");
  expect(preparation.jobs.prepare.permissions).toEqual({
    contents: "read",
    "pull-requests": "read",
    actions: "read",
  });
  for (const job of [rehearsal.jobs.version, rehearsal.jobs.pack]) {
    expect(
      job.steps.some((step: { uses?: string }) => step.uses?.startsWith("actions/checkout")),
    ).toBe(true);
    expect(JSON.stringify(job)).not.toContain("RELEASE_APP_PRIVATE_KEY");
    expect(JSON.stringify(job)).not.toContain("actions/cache");
  }
  expect(rehearsal.jobs.pack.needs).toBe("version");
  expect(JSON.stringify(rehearsal.jobs.version)).toContain("bun run version:packages");
  expect(JSON.stringify(rehearsal.jobs.pack)).toContain(
    "bun run release:pack --ci-pack --allow-dirty",
  );
});

test("a merge releases on its pull request run only through the recorded tree", async () => {
  const root = resolve(import.meta.dir, "../..");
  const [checks, release, authority] = await Promise.all([
    readFile(resolve(root, ".github/workflows/checks.yml"), "utf8"),
    readFile(resolve(root, ".github/workflows/ci.yml"), "utf8"),
    readFile(resolve(root, "scripts/release-pull-authority.ts"), "utf8"),
  ]);
  const jobs = Bun.YAML.parse(checks).jobs;
  const record = jobs["tested-tree"];
  expect(record.if).toBeUndefined();
  expect(record.permissions).toEqual({ contents: "read" });
  expect(JSON.stringify(record.steps)).toContain("git rev-parse 'HEAD^{tree}'");
  expect(record.steps.at(-1).with.name).toBe("tested-tree-${{ steps.tree.outputs.tree }}");
  expect(authority).toContain('TESTED_TREE_PREFIX = "tested-tree-"');
  expect(jobs["ci-gate"].needs).toContain("tested-tree");
  expect(jobs["ci-gate"].steps[0].run).toContain('test "$TESTED_TREE_RESULT" = success');
  const workflow = Bun.YAML.parse(release);
  expect(workflow.on.push).toEqual({ branches: ["main"] });
  expect(workflow.on.workflow_run).toEqual({
    workflows: ["CI"],
    branches: ["main"],
    types: ["completed"],
  });
  const select = workflow.jobs["select-release-mode"];
  expect(select.outputs.ci_run_id).toBe("${{ steps.select.outputs.ci_run_id }}");
  expect(select.outputs.evidence_run_id).toBe("${{ steps.select.outputs.evidence_run_id }}");
  const downloads = workflow.jobs.pack.steps.filter((step: { uses?: string }) =>
    step.uses?.startsWith("actions/download-artifact"),
  );
  expect(downloads.map((step: { with: { "run-id": string } }) => step.with["run-id"])).toEqual([
    "${{ needs.select-release-mode.outputs.ci_run_id }}",
    "${{ needs.select-release-mode.outputs.evidence_run_id }}",
  ]);
  expect(downloads[1].if).toBe("needs.select-release-mode.outputs.evidence_run_id != ''");
  expect(downloads[1].with.pattern).toBe("create-capability-table-*");
  // The lead time is reported for every release and can never fail one.
  const leadTime = workflow.jobs.publish.steps.at(-1);
  expect(leadTime.name).toBe("Report the release lead time against the 30-minute budget");
  expect(leadTime["continue-on-error"]).toBe(true);
});

test("only a version-only release pull request skips the slow measurements", async () => {
  const root = resolve(import.meta.dir, "../..");
  const [checks, readiness] = await Promise.all(
    ["checks.yml", "release-readiness.yml"].map(async (name) =>
      Bun.YAML.parse(await readFile(resolve(root, ".github/workflows", name), "utf8")),
    ),
  );
  const jobs = checks.jobs;
  const versionOnly = "needs.release-scope.outputs.version_only";
  expect(jobs["release-scope"].if).toBe("github.event_name == 'pull_request'");
  expect(jobs["release-scope"].permissions).toEqual({ contents: "read" });
  expect(JSON.stringify(jobs["release-scope"].steps)).toContain("scripts/release-pr-scope.ts");
  expect(jobs["docs-installations"].needs).toBe("release-scope");
  expect(jobs["docs-installations"].if).toBe(`\${{ !cancelled() && ${versionOnly} != 'true' }}`);
  expect(jobs["contributor-quickstart"].needs).toEqual(["quickstart-changes", "release-scope"]);
  // Main always runs the quickstart; a pull request runs it unless it is the version-only release.
  expect(jobs["contributor-quickstart"].if).toContain("github.event_name != 'pull_request' ||");
  expect(jobs["contributor-quickstart"].if).toContain(`${versionOnly} != 'true'`);
  expect(jobs["release-readiness"].with).toEqual({
    version_only: `\${{ ${versionOnly} == 'true' }}`,
  });
  const gate = jobs["ci-gate"];
  expect(gate.needs).toContain("release-scope");
  expect(gate.env.VERSION_ONLY).toBe(`\${{ ${versionOnly} }}`);
  expect(gate.steps[0].run).toContain(
    'if test "$VERSION_ONLY" = true; then\n  test "$DOCS_INSTALLATIONS_RESULT" = skipped\nelse\n  test "$DOCS_INSTALLATIONS_RESULT" = success\nfi',
  );
  expect(readiness.on.workflow_call.inputs.version_only).toMatchObject({
    type: "boolean",
    default: false,
  });
  const skipped = ["dev-loop-benchmark", "creation-capability", "creation-capability-table"];
  for (const [name, job] of Object.entries<{ if?: string }>(readiness.jobs)) {
    if (skipped.includes(name) || name === "release-evidence")
      expect(job.if).toContain("!inputs.version_only");
    // Versioning, packaging, the beta rehearsal, agent evaluations and MCP always run.
    else expect(job.if).toBeUndefined();
  }
});
