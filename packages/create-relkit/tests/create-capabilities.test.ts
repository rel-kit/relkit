import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATE_CAPABILITY_TABLE,
  assertCreateCapability,
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
  it("accepts only the current fully evidenced tuple", () => {
    expect(() => assertCreateCapability(supported, identity)).not.toThrow();
    expect(() => assertCreateCapability({ ...supported, template: "agent" }, identity)).toThrow(
      "not certified",
    );
    expect(() => assertCreateCapability(supported, { ...identity, bun: "1.3.11" })).toThrow(
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
    const root = join(
      import.meta.dirname,
      "../../../openspec/changes/fast-generated-dev-readiness/evidence",
    );
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
  const report = JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
  expect(report).toMatchObject({
    protocol: "relkit.dev-readiness",
    version: 1,
    mode: "candidate-certification",
    set,
    command: "bun dev",
    summary: { runs: 20, passed: true },
    identity: {
      bun: { version: entry.identity.bun },
      cli: { version: entry.identity.release },
      typescript: { version: entry.identity.typescript },
    },
    fixture: { examples: entry.examples ? "examples" : "no-examples" },
  });
  expect(report.attempts).toHaveLength(20);
  expect(
    report.attempts.every(
      (attempt: any) => attempt.sample?.outcome === "response" && attempt.sample.durationMs < 500,
    ),
  ).toBe(true);
  expect(Array.isArray(report.identity.artifacts)).toBe(true);
  expect(report.identity.artifacts.some((artifact: any) => artifact.name === "create-relkit")).toBe(
    true,
  );
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
