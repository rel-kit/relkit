/**
 * Proves the partition index covers the graph's full HTTP route set. A prepared
 * probe must identify a normal GET target, or the exact empty/example-free
 * graph table; data-only receipt claims never manufacture readiness authority.
 */
import { canonicalJson } from "@relkit/contracts";
import type { ApplicationGraph, TriggerNode } from "@relkit/graph";
import { Effect, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { SnapshotRouteProjection } from "./snapshot.schemas.js";
import { snapshotDigest } from "./snapshot-fingerprint.js";
import { cohortRejected } from "./snapshot-json.js";
import type { DevSnapshot } from "./snapshot.types.js";

/**
 * Checks executable coverage and the safe probe's actual graph target.
 * @param graph - Graph accepted by its complete owning validator.
 * @param receipt - Receipt with verified partitions and executable bytes.
 * @returns Complete route authority or typed cohort rejection without imports.
 */
export const verifySnapshotRoutes = Effect.fn("DevSnapshot.routes")(function* (
  graph: ApplicationGraph,
  receipt: DevSnapshot,
) {
  const nodes = graph.nodes.filter(
    (node): node is TriggerNode => node.kind === "trigger" && node.triggerType === "http",
  );
  const routes = yield* Effect.forEach(nodes, (node) =>
    Schema.decodeUnknownEffect(SnapshotRouteProjection)(node.config).pipe(
      Effect.map((config) => ({
        id: node.id,
        targetFunctionId: node.targetFunctionId,
        ...config,
      })),
      mapErrorCause(() => cohortRejected("cohort.routeShape")),
    ),
  );
  const ids = routes.map((route) => route.id).sort();
  const indexed = receipt.routeImports.map((route) => route.routeId).sort();
  if (canonicalJson(ids) !== canonicalJson(indexed))
    return yield* cohortRejected("cohort.routeCoverage");
  const artifacts = new Set(receipt.artifacts.map((member) => member.path));
  if (
    receipt.routeImports.some((route) =>
      route.members.some((member) => !member.startsWith("server/") || !artifacts.has(member)),
    )
  )
    return yield* cohortRejected("cohort.routeMember");
  if (receipt.readiness.kind === "graph") {
    const table = [...routes].sort((left, right) => left.id.localeCompare(right.id));
    if (snapshotDigest(canonicalJson(table)) !== receipt.readiness.routeTableHash)
      return yield* cohortRejected("cohort.routeTableHash");
    return;
  }
  const path = receipt.readiness.path.split("?")[0];
  const route = routes.find((route) => route.method === "GET" && route.path === path);
  if (
    route === undefined ||
    !graph.nodes.some(
      (node) =>
        node.kind === "function" &&
        node.id === route.targetFunctionId &&
        node.invocationMode === "callable",
    )
  )
    return yield* cohortRejected("cohort.readinessTarget");
});
