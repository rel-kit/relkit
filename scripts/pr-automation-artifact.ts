/** Reads one bounded JSON entry from the exact CI artifact without extracting PR-controlled paths into the trusted checkout. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Schema } from "effect";
import { automationCommand } from "./pr-automation-io.js";
import { DependencyBundle } from "./dependency-update.schemas.js";
import { PreparationArtifacts, PreparationJobs } from "./pr-automation.schemas.js";
import type { PreparationRunData } from "./pr-automation.types.js";

/**
 * Selects only a successful normalization job's artifact from the exact run attempt.
 * @param root - Trusted base checkout used by gh.
 * @param repository - Admitted repository name.
 * @param run - Admitted source run.
 * @param signal - Owning preparation cancellation.
 * @returns Schema-validated data; fails closed on missing, expired, oversized or ambiguous output.
 */
export async function readDependencyArtifact(
  root: string,
  repository: string,
  run: PreparationRunData,
  signal: AbortSignal,
) {
  const endpoint = `/repos/${repository}/actions/runs/${run.id}`;
  const api = (path: string) =>
    automationCommand("gh", ["api", "--hostname", "github.com", path], root, signal);
  const jobs = Schema.decodeUnknownSync(Schema.fromJsonString(PreparationJobs))(
    await api(`${endpoint}/attempts/${run.run_attempt}/jobs?per_page=100`),
  );
  assert.equal(jobs.total_count, jobs.jobs.length, "Incomplete producer listing");
  const producer = jobs.jobs.filter((job) => job.name === "Normalize dependency update");
  assert.equal(producer.length, 1, "Expected one dependency preparation job");
  assert.equal(
    producer[0]!.conclusion,
    "success",
    "Dependency preparation must succeed before automatic writes",
  );
  const artifacts = Schema.decodeUnknownSync(Schema.fromJsonString(PreparationArtifacts))(
    await api(`${endpoint}/artifacts?per_page=100`),
  );
  assert.equal(artifacts.total_count, artifacts.artifacts.length, "Incomplete artifact listing");
  const selected = artifacts.artifacts.filter(
    (artifact) =>
      artifact.name === `dependency-update-${run.head_sha}-${run.run_attempt}` && !artifact.expired,
  );
  assert.equal(selected.length, 1, "Expected one exact-head dependency artifact");
  const artifact = selected[0]!;
  assert.ok(artifact.size_in_bytes <= 20 * 1024 * 1024, "Dependency archive exceeds size bound");
  const content = await readArchiveJson(root, repository, artifact.id, signal);
  return Schema.decodeUnknownSync(Schema.fromJsonString(DependencyBundle))(content);
}

/**
 * Reads only updates.json from a finite ZIP; arbitrary archive paths never reach the filesystem.
 * @param root - Trusted checkout used by installed platform tools.
 * @param repository - Admitted repository.
 * @param id - Server-selected artifact ID.
 * @param signal - Owning cancellation signal.
 * @returns Bounded UTF-8 JSON after cleanup of the owned temporary ZIP.
 */
async function readArchiveJson(
  root: string,
  repository: string,
  id: number,
  signal: AbortSignal,
): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "relkit-pr-artifact-"));
  try {
    const { stdout } = await promisify(execFile)(
      "gh",
      ["api", "--hostname", "github.com", `/repos/${repository}/actions/artifacts/${id}/zip`],
      {
        cwd: root,
        signal,
        timeout: 30_000,
        killSignal: "SIGKILL",
        maxBuffer: 20 * 1024 * 1024,
        encoding: "buffer",
      },
    );
    const archive = join(temporary, "artifact.zip");
    await writeFile(archive, stdout);
    return await automationCommand("unzip", ["-p", archive, "updates.json"], root, signal);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
