/**
 * Runs paired compiler acceptance in a native Bun process so the existing fixture
 * evaluator retains its runtime and module provenance. Signal-driven interruption
 * settles temporary fixture cleanup before the probe exits.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Effect } from "effect";
import { compileProject } from "../../../tests/compiler/fixture-runner.js";
import { compileGroupedFixtureEffect } from "./grouped-fixture.js";
import { layoutContract } from "../src/layout-contract.js";
import { runLayoutProbe } from "./layout-probe-runner.js";
import { assertGroupedArtifacts } from "./grouped-artifacts.js";
import { assertGroupedDeployment } from "../../../tests/deployment/grouped-layout-contract.js";
import { assertGroupedPulumi } from "../../../tests/deployment/grouped-pulumi.js";
import { assertGroupedSourceNavigation } from "../../../tests/inspector/grouped-source-navigation.js";

/**
 * Verifies one real fixture before and after a complete service source move.
 * @param name - Checked-in fixture directory, supplied by the owning test process.
 * @returns Lazy acceptance assertions; operational failures and defects remain visible.
 */
const acceptance = Effect.fn("LayoutProbe.acceptance")(function* (name: string) {
  const root = resolve(import.meta.dir, "../../../tests/compiler/fixtures", name);
  const flat = yield* Effect.tryPromise(() => compileProject(name, root));
  const grouped = yield* compileGroupedFixtureEffect(`${name}-grouped`, root, flat.sources);
  assert.equal(flat.exitCode, 0);
  assert.deepEqual(
    grouped.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const before = flat.normalization.graph;
  const after = grouped.normalization.graph;
  assert.ok(before);
  assert.ok(after);
  assert.deepEqual(layoutContract(after), layoutContract(before));
  assertGroupedArtifacts(flat, grouped);
  assertGroupedSourceNavigation(before, after);
  assertGroupedDeployment(before, after);
  if (name === "valid-full") yield* assertGroupedPulumi(before, after);
  assert.ok(after.nodes.some((node) => node.source.file.startsWith("src/services/")));
  assert.equal(
    after.nodes.some((node) => node.id.startsWith("services.")),
    false,
  );
  const identities = new Set(
    flat.normalization.descriptors.map((descriptor) => `${descriptor.kind}:${descriptor.id}`),
  );
  assert.deepEqual(
    new Set(
      grouped.normalization.descriptors.map((descriptor) => `${descriptor.kind}:${descriptor.id}`),
    ),
    identities,
  );
});

if (import.meta.main) await runLayoutProbe(acceptance(process.argv[2] ?? "valid-minimal"));
