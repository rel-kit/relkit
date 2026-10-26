/** Checks source/execution separation and bounded follow-up authority in the deployed workflow wiring. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Schema } from "effect";

const step = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  if: Schema.optionalKey(Schema.String),
  run: Schema.optionalKey(Schema.String),
  with: Schema.optionalKey(Schema.Struct({ ref: Schema.optionalKey(Schema.String) })),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const concurrency = Schema.Struct({
  group: Schema.String,
  "cancel-in-progress": Schema.Union([Schema.String, Schema.Boolean]),
  queue: Schema.optionalKey(Schema.String),
});
const workflow = Schema.Struct({
  "cache-mode": Schema.optionalKey(Schema.String),
  concurrency,
  jobs: Schema.Record(
    Schema.String,
    Schema.Struct({
      name: Schema.String,
      if: Schema.String,
      "cache-mode": Schema.optionalKey(Schema.String),
      steps: Schema.Array(step),
      permissions: Schema.Record(Schema.String, Schema.String),
    }),
  ),
});

test("main CI cannot replace another commit and release snapshots reconcile without publication secrets", async () => {
  const root = resolve(import.meta.dir, "../..");
  const release = Schema.decodeUnknownSync(workflow)(
    Bun.YAML.parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")),
  );
  const checks = Schema.decodeUnknownSync(Schema.Struct({ concurrency }))(
    Bun.YAML.parse(await readFile(resolve(root, ".github/workflows/checks.yml"), "utf8")),
  );
  expect(checks.concurrency.group).toBe("ci-${{ github.event.pull_request.number || github.sha }}");
  expect(checks.concurrency["cancel-in-progress"]).toBe(
    "${{ github.event_name == 'pull_request' }}",
  );
  expect(release.concurrency).toEqual({
    group: "relkit-release-main",
    "cancel-in-progress": false,
    queue: "max",
  });
  expect(release["cache-mode"]).toBe("none");
  for (const job of Object.values(release.jobs))
    expect(job["cache-mode"] ?? release["cache-mode"]).toBe("none");
  const select = release.jobs["select-release-mode"];
  expect(select.steps[0]?.with?.ref).toBe("${{ github.sha }}");
  expect(release.jobs.pack.name).toContain("${{ needs.select-release-mode.outputs.sha }}");
  expect(release.jobs.pack.permissions).toEqual({ contents: "read" });
  const follow = release.jobs.reconcile;
  expect(follow.permissions).toEqual({ contents: "read", actions: "write" });
  expect(follow.if).toContain("needs.select-release-mode.outputs.mode == 'none'");
  expect(follow.if).toContain("needs.publish.result == 'success'");
  expect(follow.if).toContain("needs.version.result == 'success'");
  expect(JSON.stringify(follow)).not.toContain("RELEASE_APP_PRIVATE_KEY");
  const continuation = follow.steps.at(-1);
  expect(continuation?.env?.PUBLISHED_SOURCE_SHA).toBe(
    "${{ needs.publish.result == 'success' && needs.select-release-mode.outputs.sha || '' }}",
  );
  expect(continuation?.run).toBe("bun scripts/select-release.ts --reconcile");
  for (const step of release.jobs.version.steps.filter(
    (step: { id?: string; name?: string }) =>
      step.id === "release-app" ||
      step.name === "Create or update the reviewed release pull request" ||
      step.name === "Auto-merge after the actual pull request checks pass",
  ))
    expect(step.if).toBe("steps.current.outputs.ready == 'true'");
});
