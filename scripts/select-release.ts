/** Reconciles one immutable main snapshot with publication state; Effect owns native cancellation and only fixed decisions reach workflow stdout. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Context, Effect, Layer, Logger } from "effect";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { automationCommand, prepareOperation } from "./pr-automation-io.js";
import { findReleaseRecovery, recoverRelease } from "./release-recovery.js";
import { readReleasePlan } from "./release-plan.js";
import { releasePullBuiltOn } from "./release-pull-authority.js";
import {
  currentMain,
  pendingChangesets,
  releaseAuthority,
  releaseComplete,
  releaseGit,
  releaseSource,
  successfulReleaseCi,
} from "./release-source.js";
import type { ReleaseApi, ReleaseAuthority, ReleaseDecision } from "./release-automation.types.js";

/**
 * Converts admitted original archives into the fixed workflow output contract.
 * @param original - Verified immutable archive identity.
 * @returns The recovery decision; no additional lookup or mutation occurs.
 */
function recoveryDecision(original: Awaited<ReturnType<typeof recoverRelease>>): ReleaseDecision {
  return {
    mode: "recover",
    sha: original.sha,
    artifact_id: original.artifactId,
    artifact_run_id: original.runId,
  };
}

/**
 * Names the full CI run whose creation measurements describe a batch verified by a pull request run.
 * The release pull request runs a reduced suite, so the measurements come from the commit it was
 * versioned from.
 * @param root - Immutable execution checkout.
 * @param repository - Trusted workflow repository.
 * @param sha - Batch source commit.
 * @param ci - Run that verified the batch source.
 * @param read - Bounded authenticated API adapter.
 * @param signal - Owning native cancellation.
 * @returns The extra evidence run, or nothing when the verifying run is a full main run.
 */
async function measuredEvidence(
  root: string,
  repository: string,
  sha: string,
  ci: ReleaseAuthority,
  read: ReleaseApi,
  signal: AbortSignal,
): Promise<Pick<ReleaseDecision, "evidence_run_id">> {
  if (ci.source !== "pull_request") return {};
  const [, ...parents] = (
    await releaseGit(root, ["rev-list", "--parents", "-n", "1", sha], signal)
  ).split(" ");
  if (parents.length !== 1) return {};
  const measured = await releaseAuthority(root, repository, parents[0]!, read, signal);
  return measured && measured.run !== ci.run ? { evidence_run_id: measured.run } : {};
}

/**
 * Selects original batch archives before allowing a later batch to be versioned.
 * @param root - Immutable execution checkout, never a moving main checkout.
 * @param repository - Trusted workflow repository.
 * @param recoveryRun - Explicit original run for manual recovery, if any.
 * @param signal - Owning native cancellation.
 * @returns A fixed workflow decision, with source SHA independent of execution SHA.
 */
async function selectRelease(
  root: string,
  repository: string,
  recoveryRun: string,
  signal: AbortSignal,
): Promise<ReleaseDecision> {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  const read: ReleaseApi = (path) =>
    automationCommand("gh", ["api", "--hostname", "github.com", path], root, signal);
  const head = await releaseGit(root, ["rev-parse", "HEAD"], signal);
  if (recoveryRun) {
    const original = await recoverRelease(repository, recoveryRun, read);
    await releaseGit(root, ["merge-base", "--is-ancestor", original.sha, head], signal);
    return recoveryDecision(original);
  }
  const plan = await readReleasePlan(root);
  if (plan && !(await releaseComplete(root, repository, plan.version, signal))) {
    const sha = await releaseSource(root, plan, signal);
    const ci = await releaseAuthority(root, repository, sha, read, signal);
    if (!ci) return { mode: "none", sha: head };
    // An older queued execution must also discover packs made by a newer execution.
    await releaseGit(root, ["fetch", "--no-tags", "origin", "main"], signal);
    const original = await findReleaseRecovery(
      repository,
      sha,
      async (executionSha) =>
        (await releaseGit(root, ["merge-base", sha, executionSha], signal)) === sha,
      read,
    );
    if (original) return recoveryDecision(original);
    return {
      mode: "publish",
      sha,
      ci_run_id: ci.run,
      ...(await measuredEvidence(root, repository, sha, ci, read, signal)),
    };
  }
  if (
    (await pendingChangesets(root)) &&
    head === (await currentMain(repository, read)) &&
    (await releaseAuthority(root, repository, head, read, signal)) &&
    // The merge and its later main CI both start Release; only the first versions this commit.
    !(await releasePullBuiltOn(repository, head, read))
  )
    return { mode: "version", sha: head };
  return { mode: "none", sha: head };
}

/**
 * Schedules the latest verified main after historical publication or a superseded snapshot.
 * @param root - Trusted execution checkout.
 * @param repository - Trusted workflow repository.
 * @param publishedSource - Set only after publication actually succeeds.
 * @param signal - Owning native cancellation.
 * @returns The dispatched SHA, or undefined when caught up or awaiting main CI.
 */
async function reconcileRelease(
  root: string,
  repository: string,
  publishedSource: string,
  signal: AbortSignal,
) {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  const read: ReleaseApi = (path) =>
    automationCommand("gh", ["api", "--hostname", "github.com", path], root, signal);
  const execution = await releaseGit(root, ["rev-parse", "HEAD"], signal);
  const main = await currentMain(repository, read);
  if (main === execution && (!publishedSource || main === publishedSource)) return undefined;
  // A dispatch is verified as a main run; a pull request run acts through its merge's own Release run.
  const ci = await successfulReleaseCi(repository, main, read);
  if (!ci) return undefined;
  await automationCommand(
    "gh",
    [
      "api",
      "--method",
      "POST",
      `/repos/${repository}/actions/workflows/ci.yml/dispatches`,
      "-f",
      "ref=main",
      "-f",
      `inputs[verified_sha]=${main}`,
      "-f",
      `inputs[ci_run_id]=${ci}`,
    ],
    root,
    signal,
  );
  return main;
}

/** Owns the finite release decision and follow-up operations, using the existing abort-and-join native boundary. */
class ReleaseSelection extends Context.Service<ReleaseSelection>()("relkit/ReleaseSelection", {
  make: Effect.succeed({
    select: Effect.fn("ReleaseSelection.select")(function* (
      root: string,
      repository: string,
      recoveryRun: string,
    ) {
      const decision = yield* prepareOperation("release.select", (signal) =>
        selectRelease(root, repository, recoveryRun, signal),
      );
      yield* Effect.logInfo("Release selection completed", decision);
      return decision;
    }),
    reconcile: Effect.fn("ReleaseSelection.reconcile")(function* (
      root: string,
      repository: string,
      publishedSource: string,
    ) {
      const sha = yield* prepareOperation("release.reconcile", (signal) =>
        reconcileRelease(root, repository, publishedSource, signal),
      );
      yield* Effect.logInfo("Release reconciliation completed", { dispatched: sha ?? "none" });
      return sha;
    }),
  }),
}) {}

if (import.meta.main) {
  const program = Effect.gen(function* () {
    const service = yield* ReleaseSelection;
    const root = resolve(import.meta.dir, "..");
    const repository = process.env.GITHUB_REPOSITORY ?? "";
    if (process.argv.includes("--reconcile")) {
      yield* service.reconcile(root, repository, process.env.PUBLISHED_SOURCE_SHA ?? "");
    } else {
      const decision = yield* service.select(root, repository, process.env.RECOVERY_RUN_ID ?? "");
      yield* Effect.sync(() => {
        for (const [name, value] of Object.entries(decision)) console.log(`${name}=${value}`);
      });
    }
  });
  await runBenchmarkMain(
    program.pipe(
      Effect.provide(Layer.effect(ReleaseSelection, ReleaseSelection.make)),
      Effect.provideService(Logger.LogToStderr, true),
    ),
  );
}
