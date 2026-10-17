/** Validates packed creation evidence and renders the exact capability entry; callers own persistence and rollback of candidate bytes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { CreateCapabilityEvidence } from "create-relkit";

/** Hashes the complete ordered template, including versioned dependency declarations. */
export async function templateDigest(root: string): Promise<string> {
  async function paths(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((entry) => {
          const path = join(directory, entry.name);
          return entry.isDirectory() ? paths(path) : [path];
        }),
      )
    )
      .flat()
      .sort();
  }
  const hash = createHash("sha256");
  for (const path of await paths(root)) {
    hash.update(relative(root, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Replaces only the owned allow-list; generated candidate bytes are rolled back on failure. */
export function renderCapabilitySource(source: string, entry: CreateCapabilityEvidence): string {
  const pattern =
    /const entries: readonly CreateCapabilityEvidence\[\] = Object\.freeze\(\[[\s\S]*?\n\]\);/;
  assert.ok(pattern.test(source), "Cannot locate the creation capability allow-list");
  const literal = JSON.stringify(
    { ...entry, identity: "__RELKIT_CREATE_IDENTITY__" },
    null,
    2,
  ).replace(
    JSON.stringify("__RELKIT_CREATE_IDENTITY__"),
    `Object.freeze(${JSON.stringify(entry.identity, null, 2)})`,
  );
  return source.replace(
    pattern,
    `const entries: readonly CreateCapabilityEvidence[] = Object.freeze([\n  Object.freeze(${literal}),\n]);`,
  );
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

/**
 * Rejects stale or incomplete evidence; version 2 separates readiness from performance.
 * @param value - Untrusted report parsed from the measurement driver.
 * @param entry - Exact candidate identity proposed for the capability table.
 * @param set - Required fresh-installed or unchanged-restart cohort.
 * @returns Nothing after all identity, response, timing and cleanup assertions pass.
 */
export function validateCreationReport(
  value: unknown,
  entry: CreateCapabilityEvidence,
  set: "fresh" | "restart",
): void {
  const report = record(value);
  assert.equal(report.protocol, "relkit.dev-readiness");
  const readinessOnly = report.version === 2;
  assert.ok(readinessOnly || report.version === 1, "Unknown readiness report version");
  assert.equal(report.mode, readinessOnly ? "candidate-readiness" : "candidate-certification");
  assert.equal(report.set, set);
  assert.equal(report.command, "bun dev");
  assert.equal(report.thresholdMs, 1_000);
  const fixture = record(report.fixture);
  assert.equal(fixture.version, entry.identity.release);
  assert.equal(fixture.examples, "examples");
  const identity = record(report.identity);
  assert.equal(record(identity.bun).version, entry.identity.bun);
  assert.equal(record(identity.cli).version, entry.identity.release);
  assert.equal(record(identity.typescript).version, entry.identity.typescript);
  assert.equal(identity.inspectorOverride, "absent");
  assert.ok(Array.isArray(identity.artifacts) && identity.artifacts.length > 0);
  const artifacts = identity.artifacts.map(record);
  for (const name of ["create-relkit", "@relkit/cli"])
    assert.ok(artifacts.some((artifact) => artifact.name === name));
  for (const artifact of artifacts) assert.match(String(artifact.hash), /^sha256:[a-f0-9]{64}$/);
  const summary = record(report.summary);
  assert.equal(summary.runs, 20);
  const admission = readinessOnly ? record(report.readiness) : summary;
  if (readinessOnly) {
    assert.equal(admission.deadlineMs, 30_000);
    assert.equal(admission.runs, 20);
    assert.equal(report.expectedRuns, 20);
  }
  assert.equal(admission.passed, true);
  assert.equal(admission.preparationPassed, true);
  assert.ok(Array.isArray(report.attempts));
  assert.equal(report.attempts.length, 20);
  for (const [index, value] of report.attempts.entries()) {
    const attempt = record(value);
    assert.equal(attempt.run, index + 1);
    validateSample(attempt.sample, readinessOnly ? 30_000 : 1_000);
  }
  if (set === "restart")
    validateSample(record(report.preparationAttempt).sample, readinessOnly ? 30_000 : 1_000);
  const preparationPassed =
    set === "fresh" || belowTarget(record(report.preparationAttempt).sample);
  assert.equal(summary.preparationPassed, preparationPassed);
  assert.equal(
    summary.passed,
    preparationPassed && report.attempts.every((value) => belowTarget(record(value).sample)),
    "Performance verdict must preserve every slow sample",
  );
}

function belowTarget(value: unknown): boolean {
  const sample = record(value);
  return typeof sample.durationMs === "number" && sample.durationMs < 1_000;
}

function validateSample(value: unknown, deadlineMs: number): void {
  const sample = record(value);
  assert.equal(sample.outcome, "response");
  assert.ok(
    typeof sample.durationMs === "number" &&
      Number.isFinite(sample.durationMs) &&
      sample.durationMs >= 0 &&
      sample.durationMs < deadlineMs,
  );
  assert.equal(sample.cleanupFailure, undefined);
  assert.equal(sample.exitCode, undefined);
}
