/** Emits an exact-head commit as JSON using trusted base code and GitHub/PR data; the workflow owns output files and later write credentials. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Context, Effect, Layer, Logger, Schema } from "effect";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { automationCommand, prepareOperation } from "./pr-automation-io.js";
import {
  admitDependencyBundle,
  admitPreparation,
  preparationCommit,
} from "./pr-automation-policy.js";
import { PreparationPull, PreparationRun } from "./pr-automation.schemas.js";
import {
  preparedChangeset,
  regularGitFiles,
  verifyEvidenceRestoration,
} from "./pr-automation-source.js";
import { readDependencyArtifact } from "./pr-automation-artifact.js";
import type { PreparedFile } from "./pr-automation.types.js";

/**
 * Resolves current server identity before fetching PR Git objects, never its executable checkout.
 * @param root - Trusted main checkout.
 * @param repository - Workflow repository context.
 * @param runId - Source CI run from workflow_run.
 * @param signal - Owning preparation cancellation.
 * @returns Admitted PR/run data, or undefined when the run has become stale or closed.
 */
async function preparationIdentity(
  root: string,
  repository: string,
  runId: string,
  signal: AbortSignal,
) {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(runId, /^[1-9][0-9]*$/);
  const api = (path: string) =>
    automationCommand(
      "gh",
      ["api", "--hostname", "github.com", `/repos/${repository}/${path}`],
      root,
      signal,
    );
  const run = Schema.decodeUnknownSync(Schema.fromJsonString(PreparationRun))(
    await api(`actions/runs/${runId}`),
  );
  assert.equal(String(run.id), runId);
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  const pulls = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(PreparationPull)))(
    await api(`commits/${run.head_sha}/pulls?per_page=100`),
  );
  assert.ok(pulls.length < 100, "Ambiguous truncated PR listing");
  const matching = pulls.filter(
    (pull) =>
      pull.state === "open" &&
      pull.head.sha === run.head_sha &&
      pull.head.ref !== "changeset-release/main",
  );
  if (matching.length === 0) return undefined;
  assert.equal(matching.length, 1, "Multiple open PRs share this head");
  const pull = Schema.decodeUnknownSync(Schema.fromJsonString(PreparationPull))(
    await api(`pulls/${matching[0]!.number}`),
  );
  admitPreparation(repository, run, pull);
  await automationCommand(
    "git",
    ["fetch", "--no-tags", "origin", pull.base.sha, pull.head.sha],
    root,
    signal,
  );
  return { pull, run };
}

/**
 * Builds data-only proposals and retains the expected-head lease until GitHub applies the commit.
 * @param root - Trusted base checkout.
 * @param repository - Owning repository.
 * @param runId - Completed source CI run.
 * @param signal - Owning cancellation signal.
 * @returns A GraphQL request or undefined for an already prepared/stale PR.
 */
async function prepareCommit(root: string, repository: string, runId: string, signal: AbortSignal) {
  const identity = await preparationIdentity(root, repository, runId, signal);
  if (!identity) return undefined;
  const { pull, run } = identity;
  const tracked = await regularGitFiles(root, pull.head.sha, signal);
  let updates: readonly PreparedFile[] = [];
  if (pull.user.login === "dependabot[bot]") {
    const bundle = await readDependencyArtifact(root, repository, run, signal);
    updates = admitDependencyBundle(bundle, repository, pull.head.sha, tracked);
    await verifyEvidenceRestoration(root, pull, updates, signal);
  }
  const changeset = await preparedChangeset(root, pull, tracked, updates, signal);
  const files = [...updates, ...changeset];
  if (files.length === 0) return undefined;
  return preparationCommit(repository, pull, files);
}

/** Owns one finite trusted planning operation; it never submits the resulting mutation. */
class PullRequestPreparation extends Context.Service<PullRequestPreparation>()(
  "relkit/PullRequestPreparation",
  {
    make: Effect.succeed({
      prepare: Effect.fn("PullRequestPreparation.prepare")(function* (
        root: string,
        repository: string,
        runId: string,
      ) {
        const result = yield* prepareOperation("pull-request.plan", (signal) =>
          prepareCommit(root, repository, runId, signal),
        );
        yield* Effect.logInfo("Pull request preparation completed", {
          runId,
          changed: result !== undefined,
        });
        return result;
      }),
    }),
  },
) {}

if (import.meta.main) {
  const program = Effect.gen(function* () {
    const preparation = yield* PullRequestPreparation;
    const request = yield* preparation.prepare(
      resolve(import.meta.dir, ".."),
      process.env.GITHUB_REPOSITORY ?? "",
      process.env.CI_RUN_ID ?? "",
    );
    if (request) yield* Effect.sync(() => console.log(JSON.stringify(request)));
  });
  await runBenchmarkMain(
    program.pipe(
      Effect.provide(Layer.effect(PullRequestPreparation, PullRequestPreparation.make)),
      Effect.provideService(Logger.LogToStderr, true),
    ),
  );
}
