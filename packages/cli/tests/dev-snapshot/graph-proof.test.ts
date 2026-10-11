/**
 * Checks example-free live graph identity against a validated sealed fixture.
 * Response faults cannot authorize activation. Route comparison tests use data-only
 * expected receipts to isolate ordering and coverage from snapshot validation.
 */
import { expect, it } from "@effect/vitest";
import { canonicalJson } from "@relkit/contracts";
import { Effect, Exit } from "effect";
import { verifySnapshotGraphResponse } from "../../src/dev-snapshot/snapshot-graph-proof.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { graphProofFixture, wrongGraphProofs } from "./graph-proof-fixture.js";

it.effect("rejects stale or unavailable live graph proof", () =>
  Effect.gen(function* () {
    const { receipt, token, body } = yield* graphProofFixture();
    yield* verifySnapshotGraphResponse({ status: 200, body: JSON.stringify(body) }, receipt, token);
    for (const value of wrongGraphProofs(body))
      expect(
        Exit.isFailure(
          yield* Effect.exit(
            verifySnapshotGraphResponse(
              { status: 200, body: JSON.stringify(value) },
              receipt,
              token,
            ),
          ),
        ),
      ).toBe(true);
    for (const response of [
      { status: 503, body: JSON.stringify(body) },
      { status: 200, body: "{" },
    ])
      expect(
        Exit.isFailure(yield* Effect.exit(verifySnapshotGraphResponse(response, receipt, token))),
      ).toBe(true);
  }),
);

it.effect("requires every route independent of live declaration order", () =>
  Effect.gen(function* () {
    const fixture = yield* graphProofFixture();
    const table = [
      { id: "a", targetFunctionId: "one", method: "GET", path: "/one" },
      { id: "b", targetFunctionId: "two", method: "POST", path: "/two" },
    ];
    const receipt = {
      ...fixture.receipt,
      readiness: { kind: "graph" as const, routeTableHash: snapshotDigest(canonicalJson(table)) },
    };
    const nodes = table
      .map(({ id, targetFunctionId, ...config }) => ({
        id,
        kind: "trigger",
        triggerType: "http",
        targetFunctionId,
        config,
      }))
      .reverse();
    const proof = { ...fixture.body, graph: { nodes } };
    yield* verifySnapshotGraphResponse(
      { status: 200, body: JSON.stringify(proof) },
      receipt,
      fixture.token,
    );
    proof.graph.nodes.pop();
    expect(
      Exit.isFailure(
        yield* Effect.exit(
          verifySnapshotGraphResponse(
            { status: 200, body: JSON.stringify(proof) },
            receipt,
            fixture.token,
          ),
        ),
      ),
    ).toBe(true);
  }),
);
