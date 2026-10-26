/** Checks workflow wiring into the required CI and release boundaries; adversarial authority behavior is exercised by the verifier and handoff suites. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("CI gates merges and only green main runs start releases", async () => {
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
    expect(checkout.with.ref).toBe("${{ github.sha }}");
  }
  const packGuard = release.jobs.pack.steps.find(
    (step: { name?: string }) => step.name === "Require the exact verified pack commit",
  );
  expect(packGuard.env.VERIFIED_SHA).toBe("${{ needs.select-release-mode.outputs.sha }}");
  expect(packGuard.run).toContain('test "$GITHUB_SHA" = "$VERIFIED_SHA"');
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
