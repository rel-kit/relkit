/** Finds original packs across execution commits and attempts; missing immutable archives fail closed. */
import assert from "node:assert/strict";
import { Schema } from "effect";
import {
  ReleaseArtifacts,
  ReleaseJobs,
  ReleaseRun,
  ReleaseRuns,
} from "./release-automation.schemas.js";
import type { ReleaseApi, ReleasePackJob, ReleaseRunRecord } from "./release-automation.types.js";

const packName = "Build validated npm artifacts";

/**
 * Checks the owning workflow independently of artifact-supplied identity.
 * @param repository - Trusted repository context.
 * @param run - Decoded GitHub run or attempt.
 * @returns Nothing; throws on foreign execution authority.
 */
function admitRun(repository: string, run: ReleaseRunRecord): void {
  assert.equal(run.path, ".github/workflows/ci.yml");
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_repository.full_name, repository);
  assert.ok(["workflow_run", "workflow_dispatch"].includes(run.event));
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
}

/**
 * Reads all attempts without silently ignoring truncated job history.
 * @param repository - Trusted repository context.
 * @param runId - Validated run identifier.
 * @param read - Bounded authenticated API adapter.
 * @returns Complete original pack evidence or a failure requiring investigation.
 */
async function packJobs(repository: string, runId: string, read: ReleaseApi) {
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseJobs))(
    await read(`/repos/${repository}/actions/runs/${runId}/jobs?filter=all&per_page=100`),
  );
  assert.equal(result.total_count, result.jobs.length, "Truncated release job history");
  return result.jobs.filter(
    (job) =>
      job.conclusion === "success" &&
      (job.name === packName || /^Build validated npm artifacts \([a-f0-9]{40}\)$/.test(job.name)),
  );
}

/**
 * Reuses a prior pack, including an earlier attempt of the currently running workflow.
 * @param repository - Trusted repository context.
 * @param sha - Original batch source commit.
 * @param isDescendant - Ancestry check against freshly fetched history; missing objects fail.
 * @param read - Bounded authenticated API adapter.
 * @returns Original archives, or undefined only after the complete history proves no pack exists.
 */
export async function findReleaseRecovery(
  repository: string,
  sha: string,
  isDescendant: (executionSha: string) => Promise<boolean>,
  read: ReleaseApi,
) {
  for (let page = 1; ; page++) {
    // Search filters cap GitHub workflow-run listings at 1,000 results.
    const result = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseRuns))(
      await read(`/repos/${repository}/actions/workflows/ci.yml/runs?per_page=100&page=${page}`),
    );
    for (const run of result.workflow_runs) {
      if (run.head_branch !== "main" || run.head_repository.full_name !== repository) continue;
      if (!(await isDescendant(run.head_sha))) continue;
      admitRun(repository, run);
      const jobs = await packJobs(repository, String(run.id), read);
      if (
        jobs.some(
          (job) =>
            job.name === `${packName} (${sha})` || (job.name === packName && run.head_sha === sha),
        )
      )
        return recoverRelease(repository, String(run.id), read, sha);
    }
    if (result.workflow_runs.length < 100) {
      assert.ok(
        result.total_count <= (page - 1) * 100 + result.workflow_runs.length,
        "Truncated release run history",
      );
      return undefined;
    }
  }
}

/**
 * Admits one original archive from one successful completed pack attempt.
 * @param repository - Trusted repository context.
 * @param runId - Original Release run, not a CI run.
 * @param read - Bounded authenticated API adapter.
 * @param expectedSha - Automatic source; manual recovery rejects multiple source identities.
 * @returns Verified source SHA and immutable artifact/run IDs for downloading.
 */
export async function recoverRelease(
  repository: string,
  runId: string,
  read: ReleaseApi,
  expectedSha?: string,
) {
  assert.match(runId, /^[1-9]\d*$/);
  const prefix = `/repos/${repository}/actions/runs/${runId}`;
  const run = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseRun))(await read(prefix));
  admitRun(repository, run);
  assert.equal(String(run.id), runId);
  const packs = (await packJobs(repository, runId, read))
    .map((job) => ({
      job,
      sha: job.name === packName ? run.head_sha : job.name.slice(packName.length + 2, -1),
    }))
    .filter((pack) => expectedSha === undefined || pack.sha === expectedSha);
  assert.equal(
    packs.length,
    1,
    "Original pack is absent or ambiguous; never rebuild an immutable version",
  );
  const pack = packs[0]!;
  assert.ok(Number.isSafeInteger(pack.job.run_attempt) && pack.job.run_attempt > 0);
  const attempt = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseRun))(
    await read(`${prefix}/attempts/${pack.job.run_attempt}`),
  );
  admitRun(repository, attempt);
  assert.equal(attempt.id, run.id);
  assert.equal(attempt.head_sha, run.head_sha);
  assert.equal(attempt.run_attempt, pack.job.run_attempt);
  assert.equal(attempt.status, "completed");
  const artifactId = await originalArtifact(prefix, pack.sha, pack.job, read);
  return { sha: pack.sha, artifactId, runId };
}

/**
 * Requires the exact immutable upload made during the successful original pack.
 * @param prefix - Validated original run API path.
 * @param sha - Original pack source commit.
 * @param job - Successful completed pack evidence.
 * @param read - Bounded authenticated API adapter.
 * @returns Original artifact ID; absence, expiry, replacement and truncation fail.
 */
async function originalArtifact(
  prefix: string,
  sha: string,
  job: ReleasePackJob,
  read: ReleaseApi,
) {
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(ReleaseArtifacts))(
    await read(`${prefix}/artifacts?per_page=100`),
  );
  assert.equal(result.total_count, result.artifacts.length, "Truncated release artifact history");
  const candidates = result.artifacts.filter((item) => item.name === `npm-release-${sha}`);
  assert.equal(
    candidates.length,
    1,
    "Original release archives are missing or ambiguous; never rebuild an immutable version",
  );
  const artifact = candidates[0]!;
  assert.ok(
    !artifact.expired,
    "Original release archives expired; never rebuild an immutable version",
  );
  assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0);
  assert.ok(job.started_at && job.completed_at, "Original pack timestamps are missing");
  assert.ok(
    Date.parse(artifact.created_at) >= Date.parse(job.started_at) &&
      Date.parse(artifact.updated_at) <= Date.parse(job.completed_at),
    "Original release archives were replaced after the successful pack",
  );
  return String(artifact.id);
}
