import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { fromGraph, type DeploymentIamPlan } from "../../packages/deploy/src/index.ts";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";

const fixtureRoot = join(import.meta.dir, "..", "compiler", "fixtures");

test("derives shared IAM and future per-function grants only from graph edges", () => {
  const iam = snapshot("valid-full");

  expect(iam).toEqual(readGolden("iam-full.json", iam));
  expect(JSON.stringify(iam)).not.toContain("s3:");
  expect(JSON.stringify(iam)).not.toContain("secretsmanager:");
});

test("omits every unused cloud action from a capability-free graph", () => {
  const iam = snapshot("valid-minimal");

  expect(iam).toEqual(readGolden("iam-minimal.json"));
  expect(iam.serviceRole.statements).toEqual([]);
  expect(iam.perFunction).toEqual([]);
});

function snapshot(fixture: string): DeploymentIamPlan {
  const graph = JSON.parse(
    readFileSync(join(fixtureRoot, fixture, "expected.graph.json"), "utf8"),
  ) as ApplicationGraph;
  return fromGraph(graph).iam;
}

function readGolden(name: string, value?: unknown): unknown {
  const path = join(import.meta.dir, "golden", name);
  if (process.env.UPDATE_GOLDEN === "1" && value !== undefined) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
