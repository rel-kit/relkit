/**
 * Selects bounded identity and HTTP declarations from the protected live graph.
 * Decoding grants no activation authority: the prover compares the selected
 * generation, sealed cohort and complete route-table digest with its receipt.
 */
import { API_VERSION } from "@relkit/contracts";
import { Schema } from "effect";
import { SnapshotActivation, SnapshotHash } from "./snapshot.schemas.js";

/** Public graph declarations retain only fields required for route-table proof. */
const graphNode = Schema.Struct({
  id: Schema.String.check(Schema.isMaxLength(512)),
  kind: Schema.String.check(Schema.isMaxLength(128)),
  triggerType: Schema.optionalKey(Schema.String),
  targetFunctionId: Schema.optionalKey(Schema.String),
  config: Schema.optionalKey(Schema.Json),
});

/** The existing protected graph response, bounded independently of its body size. */
export const snapshotGraphProof = Schema.Struct({
  protocol: Schema.Literal("relkit.inspector"),
  version: Schema.Literal(API_VERSION),
  generationId: Schema.String.check(Schema.isMaxLength(512)),
  graphHash: SnapshotHash,
  activationFingerprint: SnapshotActivation,
  graph: Schema.Struct({
    nodes: Schema.Array(graphNode).check(Schema.isMaxLength(20_000)),
  }),
});
