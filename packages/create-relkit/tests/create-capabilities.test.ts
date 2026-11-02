import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATE_CAPABILITY_TABLE,
  CREATE_UNTESTED_DOCS,
  CreateUntestedError,
  assertCreateCapability,
  checkCreateCapability,
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
  it("reports the default combination as tested for the packaged release identity", () => {
    expect(() => assertCreateCapability(supported)).not.toThrow();
    expect(identity).toEqual(currentCreateCapabilityIdentity());
    expect(supportedCreateTemplates({ cloud: "none", deploy: "none", examples: true })).toEqual([
      "minimal",
    ]);
  });

  it("matches evidence by release, template and runtime major.minor", () => {
    expect(checkCreateCapability(supported, { identity })).toBeUndefined();
    expect(checkCreateCapability(supported, { identity: { ...identity, bun: "1.3.11" } })).toBe(
      undefined,
    );
    expect(
      checkCreateCapability(supported, {
        identity: { ...identity, typescript: "5.9.4", packageCatalogDigest: "other" },
      }),
    ).toBeUndefined();
    expect(checkCreateCapability(supported, { identity: { ...identity, bun: "1.4.4" } })).toEqual({
      code: "RELKIT_CREATE_UNTESTED",
      message: expect.stringContaining("on Bun 1.4"),
      docs: CREATE_UNTESTED_DOCS,
    });
    expect(
      checkCreateCapability(supported, { identity: { ...identity, release: "0.7.2" } }),
    ).toMatchObject({ code: "RELKIT_CREATE_UNTESTED" });
    expect(
      checkCreateCapability(supported, {
        identity: { ...identity, template: "default/v2/minimal" },
      }),
    ).toMatchObject({ code: "RELKIT_CREATE_UNTESTED" });
  });

  it("warns about untested combinations instead of refusing them", () => {
    const warning = checkCreateCapability({ ...supported, template: "agent" });
    expect(warning).toEqual({
      code: "RELKIT_CREATE_UNTESTED",
      message: expect.stringContaining("template=agent"),
      docs: CREATE_UNTESTED_DOCS,
    });
    expect(warning?.message).toContain("pass --strict");
    expect(checkCreateCapability(supported, { identity: { ...identity, bun: "1.3.11" } })).toBe(
      undefined,
    );
  });

  it("refuses untested combinations in strict mode and lists the tested ones", () => {
    expect(() =>
      checkCreateCapability({ ...supported, template: "agent" }, { strict: true, identity }),
    ).toThrow(CreateUntestedError);
    expect(() =>
      checkCreateCapability({ ...supported, template: "agent" }, { strict: true, identity }),
    ).toThrow("Tested: template=minimal/jobs=none/cloud=none/deploy=none/examples=on");
    expect(() => assertCreateCapability(supported, { ...identity, bun: "1.4.4" })).toThrow(
      "none for this RelKit and Bun version",
    );
    expect(() => assertCreateCapability(supported, { ...identity, bun: "1.3.11" })).not.toThrow();
  });

  it("filters partial interactive choices with the same table", () => {
    expect(
      supportedCreateTemplates({ cloud: "none", deploy: "none", examples: true }, identity),
    ).toEqual(["minimal"]);
    expect(
      supportedCreateTemplates({ cloud: "aws", deploy: "none", examples: true }, identity),
    ).toEqual([]);
  });

  it("pins the measured source template bytes", () => {
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
