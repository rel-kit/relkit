/**
 * Proves that an example-free candidate serves its protected, complete live graph.
 * The existing supervisor verifies health and cohort first; this leaf additionally
 * checks the selected generation and every HTTP declaration before activation.
 */
import { canonicalJson } from "@relkit/contracts";
import { Cause, Effect, Schema } from "effect";
import { cliAdapterError } from "../cli-errors.js";
import { decodeSnapshotJson } from "./snapshot-json.js";
import { snapshotGraphProof } from "./snapshot-graph-proof.schemas.js";
import { SnapshotRouteProjection } from "./snapshot.schemas.js";
import { snapshotDigest } from "./snapshot-fingerprint.js";
import type { SnapshotProbeResponse } from "./snapshot-candidate.types.js";
import type { DevSnapshot } from "./snapshot.types.js";
import type { SupervisorCandidateToken } from "@relkit/supervisor";

/**
 * Compares live metadata with the previously validated immutable receipt.
 * @param response - Complete bounded protected graph HTTP response.
 * @param receipt - Accepted metadata; graph readiness carries the full route digest.
 * @param token - Unpublished supervisor generation selected for this attempt.
 * @returns Typed proof completion; malformed or stale bodies fail without activation.
 */
export const verifySnapshotGraphResponse = Effect.fn("DevSnapshot.graphProof")(function* (
  response: SnapshotProbeResponse,
  receipt: DevSnapshot,
  token: SupervisorCandidateToken,
) {
  const readiness = receipt.readiness;
  if (response.status !== 200 || readiness.kind !== "graph")
    return yield* rejected("Graph readiness response is unavailable.");
  const proof = yield* decodeSnapshotJson(snapshotGraphProof, Buffer.from(response.body)).pipe(
    Effect.catchCause((cause) =>
      Effect.failCause(Cause.map(cause, (error) => cliAdapterError("dev.snapshot.graph", error))),
    ),
  );
  if (
    proof.generationId !== `generation-${token.generationToken}` ||
    proof.graphHash !== receipt.graphHash ||
    canonicalJson(proof.activationFingerprint) !== canonicalJson(receipt.activation)
  )
    return yield* rejected("Graph readiness response identifies a different live cohort.");
  const routes = yield* liveRoutes(proof.graph.nodes);
  if (snapshotDigest(canonicalJson(routes)) !== readiness.routeTableHash)
    return yield* rejected("Graph readiness response has a different HTTP route table.");
});

/**
 * Decodes every live HTTP declaration into the canonical preparation projection.
 * @param nodes - Bounded public nodes decoded from the live graph envelope.
 * @returns Sorted complete table or a typed malformed-declaration failure.
 */
const liveRoutes = Effect.fn("DevSnapshot.graphRoutes")(function* (
  nodes: Schema.Schema.Type<typeof snapshotGraphProof>["graph"]["nodes"],
) {
  const routes = yield* Effect.forEach(
    nodes.filter((node) => node.kind === "trigger" && node.triggerType === "http"),
    (node) =>
      Effect.gen(function* () {
        if (node.targetFunctionId === undefined) return yield* rejected("HTTP target is absent.");
        const config = yield* Schema.decodeUnknownEffect(SnapshotRouteProjection)(node.config).pipe(
          Effect.catchCause((cause) =>
            Effect.failCause(
              Cause.map(cause, (error) => cliAdapterError("dev.snapshot.graph.route", error)),
            ),
          ),
        );
        return { id: node.id, targetFunctionId: node.targetFunctionId, ...config };
      }),
  );
  routes.sort((left, right) => left.id.localeCompare(right.id));
  return routes;
});

/**
 * Constructs a safe proof error without retaining endpoint payloads or credentials.
 * @param message - Fixed diagnostic describing the failed comparison.
 * @returns Expected CLI adapter failure, distinct from defects and interruption.
 */
function rejected(message: string) {
  return cliAdapterError("dev.snapshot.graph", new Error(message));
}
