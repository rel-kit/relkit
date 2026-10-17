import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATE_CAPABILITY_TABLE,
  assertCreateCapability,
  currentCreateCapabilityIdentity,
  supportedCreateTemplates,
} from "../src/create-capabilities.js";

const identity = CREATE_CAPABILITY_TABLE.entries[0]!.identity;
const supported = {
  template: "minimal",
  cloud: "none",
  deploy: "none",
  examples: true,
} as const;

describe("creation capability evidence", () => {
  it("certifies the default tuple for the actual packaged release identity", () => {
    expect(() => assertCreateCapability(supported)).not.toThrow();
    expect(identity).toEqual(currentCreateCapabilityIdentity());
    expect(supportedCreateTemplates({ cloud: "none", deploy: "none", examples: true })).toEqual([
      "minimal",
    ]);
  });

  it("accepts only the current fully evidenced tuple", () => {
    expect(() => assertCreateCapability(supported, identity)).not.toThrow();
    expect(() => assertCreateCapability({ ...supported, template: "agent" }, identity)).toThrow(
      "not certified",
    );
    expect(() => assertCreateCapability(supported, { ...identity, bun: "1.3.11" })).toThrow(
      "none for this tool identity",
    );
    expect(() => assertCreateCapability(supported, { ...identity, release: "0.7.2" })).toThrow(
      "none for this tool identity",
    );
    expect(() => assertCreateCapability(supported, { ...identity, typescript: "5.9.4" })).toThrow(
      "none for this tool identity",
    );
    expect(() =>
      assertCreateCapability(supported, { ...identity, packageCatalogDigest: "stale" }),
    ).toThrow("none for this tool identity");
  });

  it("filters partial interactive choices with the same table", () => {
    expect(
      supportedCreateTemplates({ cloud: "none", deploy: "none", examples: true }, identity),
    ).toEqual(["minimal"]);
    expect(
      supportedCreateTemplates({ cloud: "aws", deploy: "none", examples: true }, identity),
    ).toEqual([]);
  });

  it("pins the certified source template bytes", () => {
    const root = join(import.meta.dirname, "../../../templates/default/v1/minimal");
    expect(templateDigest(root)).toBe(CREATE_CAPABILITY_TABLE.entries[0]!.templateDigest);
  });

  it("gates every table entry on complete passing evidence", () => {
    const root = join(import.meta.dirname, "../../..");
    for (const entry of CREATE_CAPABILITY_TABLE.entries) {
      expectEvidence(join(root, entry.freshEvidence), entry, "fresh");
      expectEvidence(join(root, entry.restartEvidence), entry, "restart");
    }
  });
});

function expectEvidence(
  path: string,
  entry: (typeof CREATE_CAPABILITY_TABLE.entries)[number],
  set: "fresh" | "restart",
): void {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const readinessOnly = report.version === 2;
  expect([1, 2]).toContain(report.version);
  expect(report).toMatchObject({
    protocol: "relkit.dev-readiness",
    mode: readinessOnly ? "candidate-readiness" : "candidate-certification",
    set,
    command: "bun dev",
    thresholdMs: 1_000,
    summary: { runs: 20 },
    identity: {
      bun: { version: entry.identity.bun },
      cli: { version: entry.identity.release },
      typescript: { version: entry.identity.typescript },
    },
    fixture: {
      version: entry.identity.release,
      examples: entry.examples ? "examples" : "no-examples",
    },
  });
  const admission = readinessOnly ? report.readiness : report.summary;
  expect(admission).toMatchObject({ passed: true, preparationPassed: true });
  if (readinessOnly) expect(admission.deadlineMs).toBe(30_000);
  expect(report.attempts).toHaveLength(20);
  const samples = report.attempts.map(
    (attempt: { sample: { durationMs: number; outcome: string } }) => attempt.sample,
  );
  if (set === "restart") samples.push(report.preparationAttempt.sample);
  for (const sample of samples) {
    expect(sample.outcome).toBe("response");
    expect(Number.isFinite(sample.durationMs)).toBe(true);
    expect(sample.durationMs).toBeGreaterThanOrEqual(0);
    expect(sample.durationMs).toBeLessThan(readinessOnly ? 30_000 : 1_000);
    expect(sample.cleanupFailure).toBeUndefined();
    expect(sample.exitCode).toBeUndefined();
  }
  expect(report.summary.passed).toBe(
    samples.every((sample: { durationMs: number }) => sample.durationMs < 1_000),
  );
  expect(
    report.identity.artifacts.some(
      (artifact: { name: string }) => artifact.name === "create-relkit",
    ),
  ).toBe(true);
}

function templateDigest(root: string): string {
  const hash = createHash("sha256");
  for (const path of paths(root)) {
    hash.update(relative(root, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function paths(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? paths(path) : [path];
    })
    .sort();
}
