/**
 * Supplies immutable receipt metadata and matching live envelopes for prover tests.
 * The fixture validates its sealed bytes through real snapshot policy with injected
 * file authority. Fault cases alter public responses, never execution authority.
 */
import { API_VERSION } from "@relkit/contracts";
import { Effect, Layer } from "effect";
import { DevSnapshots, devSnapshotsLive } from "../../src/dev-snapshot/snapshot.service.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { tools, validationFixture } from "./validation-fixture.js";

/**
 * Acquires a complete receipt and the expected initial live graph envelope.
 * @returns Validated receipt data, selected token and a matching data-only body.
 */
export const graphProofFixture = Effect.fn("GraphProofTest.fixture")(function* () {
  const fixture = validationFixture();
  const snapshot = yield* DevSnapshots.use((service) => service.validate(fixture.root, tools)).pipe(
    Effect.provide(devSnapshotsLive.pipe(Layer.provide(fixture.layer))),
  );
  const receipt = snapshot.receipt;
  return {
    receipt,
    token: { sourceToken: 0, generationToken: 1 },
    body: {
      protocol: "relkit.inspector",
      version: API_VERSION,
      generationId: "generation-1",
      graphHash: receipt.graphHash,
      activationFingerprint: receipt.activation,
      graph: { nodes: [] },
    },
  };
});

/**
 * Produces independent stale identity and incomplete graph response mutations.
 * @param body - Matching public envelope from the validated test receipt.
 * @returns Wrong response fixtures; no metadata supplied to the verifier changes.
 */
export function wrongGraphProofs(
  body: Effect.Success<ReturnType<typeof graphProofFixture>>["body"],
) {
  return [
    { ...body, generationId: "generation-0" },
    { ...body, graphHash: snapshotDigest("another graph") },
    {
      ...body,
      activationFingerprint: {
        ...body.activationFingerprint,
        manifestHash: snapshotDigest("another manifest"),
      },
    },
    { ...body, protocol: "socket-only" },
    { ...body, graph: { nodes: [{ id: "omitted", kind: "trigger", triggerType: "http" }] } },
    {
      ...body,
      graph: {
        nodes: [
          {
            id: "extra",
            kind: "trigger",
            triggerType: "http",
            targetFunctionId: "target",
            config: { method: "GET", path: "/extra" },
          },
        ],
      },
    },
  ];
}
