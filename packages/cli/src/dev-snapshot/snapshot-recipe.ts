/**
 * Constructs portable snapshot metadata from one materialized build cohort. It
 * decodes graph/activation data, indexes all HTTP routes and captures actual owned
 * build bytes. Publication later rechecks those bytes and cohort semantics before
 * activating a pointer; this module never imports executable application code.
 */
import { relative } from "node:path";
import {
  canonicalJson,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
} from "@relkit/contracts";
import { validateGraphShapeEffect, type ApplicationGraph, type TriggerNode } from "@relkit/graph";
import { Effect, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotActivation, SnapshotRouteProjection, SnapshotPath } from "./snapshot.schemas.js";
import { decodeSnapshotJson, snapshotJson } from "./snapshot-json.js";
import { snapshotDigest, snapshotFingerprint } from "./snapshot-fingerprint.js";
import { snapshotRouteImports } from "./snapshot-route-imports.js";
import type { CheckResult } from "../commands/check-result.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type {
  DevSnapshot,
  SnapshotDependency,
  SnapshotMember,
  SnapshotTools,
} from "./snapshot.types.js";
import type {
  SnapshotBuildCohort,
  SnapshotPreparationRequest,
} from "./snapshot-preparation.types.js";

/**
 * Decodes the already built graph and activation and creates a complete route index.
 * @param files - Captured bounded project file authority.
 * @param root - Physical project root.
 * @param directory - Owned build directory within the project.
 * @param probe - Safe generated workflow probe policy.
 * @returns Data-only cohort or typed decoding/semantic rejection.
 */
export const readSnapshotBuildCohort = Effect.fn("DevSnapshot.buildCohort")(function* (
  files: SnapshotFileOperations,
  root: string,
  directory: string,
  probe: SnapshotPreparationRequest["probe"],
) {
  const path = relative(root, directory);
  if (!Schema.is(SnapshotPath)(path)) return yield* rejected("recipe.buildPath");
  const parsed = yield* snapshotJson(
    yield* files.read(root, `${path}/application.graph.json`, 67_108_864),
  );
  yield* validateGraphShapeEffect(parsed).pipe(mapErrorCause(() => rejected("recipe.graph")));
  // The complete owning graph validator succeeded; its void result proves this intersection.
  const graph = parsed as typeof parsed & ApplicationGraph;
  const activation = yield* decodeSnapshotJson(
    SnapshotActivation,
    yield* files.read(root, `${path}/server/${RUNTIME_ACTIVATION_FILE}`, 65_536),
  );
  const routes = yield* snapshotRouteTable(graph);
  const metadata = yield* snapshotJson(
    yield* files.read(root, `${path}/server/bun.inputs.json`, 8_388_608),
  );
  const routeImports = yield* Effect.try({
    try: () => snapshotRouteImports(metadata, graph, routes, root),
    catch: () => rejected("recipe.routeImports"),
  });
  const hello =
    probe === "generated-hello" ||
    (probe === "auto" && routes.some((route) => route.method === "GET" && route.path === "/hello"));
  const readiness: DevSnapshot["readiness"] = hello
    ? {
        kind: "route",
        path: "/hello?name=RelKit",
        status: 200,
        body: JSON.stringify({ message: "Hello, RelKit!" }),
      }
    : { kind: "graph", routeTableHash: snapshotDigest(canonicalJson(routes)) };
  return { graph, activation, routeImports, readiness } satisfies SnapshotBuildCohort;
});

/**
 * Captures all portable build members after the import index is written.
 * @param files - Bounded file authority retaining project containment.
 * @param root - Physical project root.
 * @param directory - Owned build directory; inventory paths remain relative.
 * @returns Complete sorted byte index, excluding Bun's private absolute-path metafile.
 */
export const captureSnapshotArtifacts = Effect.fn("DevSnapshot.buildMembers")(function* (
  files: SnapshotFileOperations,
  root: string,
  directory: string,
) {
  const prefix = relative(root, directory);
  if (!Schema.is(SnapshotPath)(prefix)) return yield* rejected("recipe.buildPath");
  const paths = yield* files.projectPaths(directory);
  return yield* Effect.forEach(
    paths.filter((path) => path !== "server/bun.inputs.json"),
    (path) =>
      files
        .read(root, `${prefix}/${path}`, 67_108_864)
        .pipe(Effect.map((bytes) => ({ path, hash: snapshotDigest(bytes), bytes: bytes.length }))),
    { concurrency: 8 },
  );
});

/**
 * Produces a complete portable receipt without arbitrary resolved configuration data.
 * @param cohort - Decoded graph, activation and complete HTTP partition index.
 * @param checked - Original successful compiler outputs, used only for optional cohort paths.
 * @param tools - Actual preparation tool identity.
 * @param inputs - Complete accepted source/config/asset byte inventory.
 * @param dependencies - Actual installed bundle input identities.
 * @param artifacts - Complete accepted build member identities.
 * @param typecheckInputs - Byte and resolution evidence of the original successful check.
 * @returns Pure receipt; the publication service must decode and verify before activation.
 */
export function snapshotReceipt(
  cohort: SnapshotBuildCohort,
  checked: CheckResult,
  tools: SnapshotTools,
  inputs: readonly SnapshotMember[],
  dependencies: readonly SnapshotDependency[],
  artifacts: readonly SnapshotMember[],
  typecheckInputs: DevSnapshot["typecheckInputs"],
): DevSnapshot {
  return {
    version: 1,
    fingerprint: snapshotFingerprint({ inputs, dependencies, tools, typecheckInputs }),
    graphHash: cohort.activation.graphHash,
    graphFile: "application.graph.json",
    activationFile: `server/${RUNTIME_ACTIVATION_FILE}`,
    manifestFile: "server/runtime.manifest.ts",
    runtimeIntegrationsFile: `server/${RUNTIME_INTEGRATION_PLAN_FILE}`,
    ...(cohort.activation.jobsManifestHash === undefined
      ? {}
      : { jobsManifestFile: "jobs.manifest.json" }),
    ...(cohort.activation.localServicesPlanHash === undefined
      ? {}
      : { localServicesFile: "server/local-services.plan.json" }),
    entrypoint: "server/index.js",
    importIndex: "imports.json",
    activation: cohort.activation,
    ...(checked.config === undefined
      ? {}
      : {
          ports: { backend: checked.config.server.port, inspector: checked.config.inspector.port },
        }),
    tools,
    readiness: cohort.readiness,
    inputs,
    typecheckInputs,
    dependencies,
    artifacts,
    routeImports: cohort.routeImports,
  };
}

/**
 * Projects the full HTTP graph table in canonical route identity order.
 * @param graph - Graph already accepted by its complete owning validator.
 * @returns Exact table or typed route-shape rejection, without lazy-route omissions.
 */
const snapshotRouteTable = Effect.fn("DevSnapshot.routeTable")(function* (graph: ApplicationGraph) {
  const nodes = graph.nodes.filter(
    (node): node is TriggerNode => node.kind === "trigger" && node.triggerType === "http",
  );
  const routes = yield* Effect.forEach(nodes, (node) =>
    Schema.decodeUnknownEffect(SnapshotRouteProjection)(node.config).pipe(
      Effect.map((config) => ({ id: node.id, targetFunctionId: node.targetFunctionId, ...config })),
      mapErrorCause(() => rejected("recipe.route")),
    ),
  );
  return routes.sort((left, right) => left.id.localeCompare(right.id));
});

/**
 * Rejects inconsistent build metadata without retaining private source bytes.
 * @param operation - Fixed metadata validation context.
 * @returns Typed integrity rejection, distinct from native failures and defects.
 */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "integrity", operation });
}
