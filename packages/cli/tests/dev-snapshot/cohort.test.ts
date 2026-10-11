/**
 * Rejects coherently rehashed but structurally invalid plans and route claims.
 * Tests supply complete file authority through the same Layer as live validation;
 * no malformed document can acquire module-import or candidate-start authority.
 */
import { canonicalJson, GRAPH_VERSION } from "@relkit/contracts";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { verifySnapshotCohort } from "../../src/dev-snapshot/snapshot-cohort.js";
import { verifySnapshotRoutes } from "../../src/dev-snapshot/snapshot-route-validation.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { SnapshotFiles } from "../../src/dev-snapshot/snapshot-files.service.js";
import { validationFixture } from "./validation-fixture.js";

/**
 * Changes a plan and its declared digest together to exercise semantic checks.
 * @param source - Complete replacement document, possibly malformed or mixed.
 * @returns Full verification Exit; defects and interruptions retain their channels.
 */
function checkPlan(source: string) {
  const fixture = validationFixture();
  const activation = {
    ...fixture.receipt.activation,
    runtimeIntegrationsPlanHash: snapshotDigest(source),
  };
  fixture.bytes.set(`${fixture.capsuleRoot}/integrations.json`, source);
  fixture.bytes.set(`${fixture.capsuleRoot}/activation.json`, canonicalJson(activation));
  return Effect.exit(
    SnapshotFiles.use((files) =>
      verifySnapshotCohort(files, fixture.capsuleRoot, { ...fixture.receipt, activation }),
    ).pipe(Effect.provide(fixture.layer)),
  );
}

it.effect("rejects rehashed invalid versions, incomplete plans and foreign graph identities", () =>
  Effect.gen(function* () {
    const { receipt } = validationFixture();
    const invalid = [
      "not JSON",
      canonicalJson({ version: 2, graphHash: receipt.graphHash, integrations: [] }),
      canonicalJson({ version: 1, graphHash: receipt.graphHash }),
      canonicalJson({ version: 1, graphHash: snapshotDigest("foreign"), integrations: [] }),
      canonicalJson({ version: 1, graphHash: receipt.graphHash, integrations: [{}] }),
    ];
    for (const source of invalid) {
      const exit = yield* checkPlan(source);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ reason: "integrity" });
    }
  }),
);

it.effect("rejects duplicate complete runtime registrations", () =>
  Effect.gen(function* () {
    const { receipt } = validationFixture();
    const entry = {
      integrationId: "memory",
      capability: "cache",
      adapterId: "memory",
      protocolVersion: 1,
      packageName: "@relkit/cache",
      packageVersion: "0.7.2",
      exportName: "cache",
    };
    const exit = yield* checkPlan(
      canonicalJson({ version: 1, graphHash: receipt.graphHash, integrations: [entry, entry] }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(Cause.squash(exit.cause)).toMatchObject({
        operation: "cohort.duplicateRegistration",
      });
  }),
);

it.effect(
  "rejects orphan partitions, wrong table hashes and fabricated normal-route readiness",
  () =>
    Effect.gen(function* () {
      const { receipt } = validationFixture();
      const graph = { contractVersion: GRAPH_VERSION, nodes: [], edges: [] };
      const claims = [
        { ...receipt, routeImports: [{ routeId: "route.hello", members: ["server.js"] }] },
        {
          ...receipt,
          readiness: { kind: "graph" as const, routeTableHash: snapshotDigest("wrong") },
        },
        {
          ...receipt,
          readiness: {
            kind: "route" as const,
            path: "/hello",
            status: 200 as const,
            body: "Hello",
          },
        },
      ];
      for (const claim of claims) {
        const exit = yield* Effect.exit(verifySnapshotRoutes(graph, claim));
        expect(Exit.isFailure(exit)).toBe(true);
      }
    }),
);
