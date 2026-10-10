/**
 * Derives a packed project's exact expected response before its measured launch.
 * Route examples use the preparation contract; example-free projects compare the
 * existing protected graph body with sealed metadata and initial generation one.
 * Reads are finite owned native calls, outside the command-to-response timer.
 */
import {
  API_BASE_PATH,
  API_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  canonicalJson,
} from "@relkit/contracts";
import { Effect, Schema } from "effect";
import { ReadinessBenchmarkError } from "./benchmark-error.js";
import {
  SnapshotFiles,
  snapshotFilesLive,
  SnapshotPointer,
  DevSnapshot,
} from "@relkit/cli/internal/tooling";
import type { SnapshotFileOperations } from "@relkit/cli/internal/tooling";

/**
 * Selects a real application response from the installed portable snapshot.
 * @param root - Installed external project prepared before measurement.
 * @param port - Available public backend port selected before the clock starts.
 * @returns Exact URL/status/body; never accepts a Ready banner or health-only response.
 */
export const packedProbeContract = Effect.fn("ReadinessBenchmark.probeContract")(
  function* (root: string, port: number) {
    const files = yield* SnapshotFiles;
    const pointer = yield* readDocument(SnapshotPointer, files, root, ".relkit/dev/current.json");
    const capsule = `.relkit/dev/generations/${pointer.generation.slice(7)}`;
    const receipt = yield* readDocument(DevSnapshot, files, root, `${capsule}/receipt.json`);
    if (receipt.readiness.kind === "route")
      return {
        url: `http://127.0.0.1:${port}${receipt.readiness.path}`,
        expectedStatus: receipt.readiness.status,
        expectedBody: receipt.readiness.body,
      };
    const graph = yield* readDocument(Schema.Json, files, root, `${capsule}/${receipt.graphFile}`);
    return {
      url: `http://127.0.0.1:${port}${API_BASE_PATH}/graph`,
      expectedStatus: 200,
      expectedBody: canonicalJson({
        generationId: "generation-1",
        graphHash: receipt.graphHash,
        activationFingerprint: receipt.activation,
        manifestGraphHash: receipt.graphHash,
        graphContractVersion: GRAPH_VERSION,
        manifestContractVersion: MANIFEST_VERSION,
        manifestGeneratorVersion: GENERATOR_VERSION,
        graph,
        protocol: "relkit.inspector",
        version: API_VERSION,
      }),
    };
  },
  (effect) => effect.pipe(Effect.provide(snapshotFilesLive)),
);

/**
 * Decodes a bounded preparation document immediately at its native read boundary.
 * @typeParam A - Precise decoded document, requiring no decoding services.
 * @param schema - Runtime document contract.
 * @param files - Acquired contained descriptor authority shared across all documents.
 * @param root - Original fixture containment root.
 * @param path - Portable metadata member selected before measurement.
 * @returns Typed document or native/schema adapter failure; no executable imports occur.
 */
function readDocument<A>(
  schema: Schema.ConstraintDecoder<A>,
  files: SnapshotFileOperations,
  root: string,
  path: string,
) {
  return files.read(root, path, 67_108_864).pipe(
    Effect.flatMap((bytes) =>
      Effect.try({
        try: () =>
          Schema.decodeUnknownSync(schema)(JSON.parse(Buffer.from(bytes).toString("utf8"))),
        catch: (cause) =>
          new ReadinessBenchmarkError({
            operation: "probe.document.decode",
            cause: new Error("Invalid prepared probe metadata", { cause }),
          }),
      }),
    ),
  );
}
