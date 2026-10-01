import { Schema } from "effect";

/** Versioned wire identifier shared by requests and responses. */
export const EVALUATOR_PROTOCOL = "relkit.evaluator" as const;

/** Supported evaluator wire version. */
export const EVALUATOR_PROTOCOL_VERSION = 1 as const;

/** Prefix separating evaluator JSON from candidate output. */
export const EVALUATOR_FRAME = "\u001erelkit-evaluator-response:";

/** Expected evaluator diagnostic codes carried across the child boundary. */
export const EvaluatorFailureCode = Schema.Literals([
  "RELKIT_EVALUATOR_REQUEST_INVALID",
  "RELKIT_EVALUATOR_ROOT_INVALID",
  "RELKIT_EVALUATOR_IMPORT_FAILED",
  "RELKIT_EVALUATOR_TIMEOUT",
  "RELKIT_EVALUATOR_PROCESS_FAILED",
  "RELKIT_EVALUATOR_PROTOCOL_INVALID",
  "RELKIT_EVALUATOR_SIDE_EFFECT",
]);

/** Native effects detected during candidate import. */
export const EvaluatorSideEffectKind = Schema.Literals([
  "listening-socket",
  "live-timer",
  "write-outside-generated-sandbox",
  "child-process",
  "direct-output",
  "unapproved-network",
]);

/** Evidence from one blocked or observed native operation. */
export const EvaluatorSideEffect = Schema.Struct({
  kind: EvaluatorSideEffectKind,
  operation: Schema.String,
  target: Schema.String,
});

/** Explicit detector limits; these hooks do not provide a security sandbox. */
export const EvaluatorDetectorCoverage = Schema.Struct({
  supported: Schema.Array(Schema.String),
  unsupported: Schema.Array(Schema.String),
});

/** Source candidate selected by syntax discovery. */
export const EvaluatorCandidate = Schema.Struct({ file: Schema.String });

/** Evaluator request decoded before any candidate import. */
export const EvaluatorRequest = Schema.Struct({
  protocol: Schema.Literal(EVALUATOR_PROTOCOL),
  version: Schema.Literal(EVALUATOR_PROTOCOL_VERSION),
  generationId: Schema.String,
  projectRoot: Schema.String,
  candidates: Schema.Array(EvaluatorCandidate),
  environmentAllowlist: Schema.Array(Schema.String),
  generatedDirectory: Schema.String,
  networkAllowlist: Schema.Array(Schema.String),
  sourceMaps: Schema.Boolean,
  timeoutMs: Schema.Number,
});

/** Data-only executable lookup instruction for the accepted generation. */
export const EvaluatorManifestReference = Schema.Struct({
  generationId: Schema.String,
  descriptorId: Schema.String,
  kind: Schema.String,
  module: Schema.String,
  exportName: Schema.String,
});

/** Directional schema provenance serialized without executable validators. */
export const EvaluatorSchemaSnapshot = Schema.Struct({
  $relkit: Schema.Literals(["schema", "schema-unavailable"]),
  jsonSchema: Schema.optionalKey(Schema.Json),
  inputJsonSchema: Schema.optionalKey(Schema.Json),
  outputJsonSchema: Schema.optionalKey(Schema.Json),
  contractHash: Schema.optionalKey(Schema.String),
  transformed: Schema.optionalKey(Schema.Boolean),
  refined: Schema.optionalKey(Schema.Boolean),
  reason: Schema.optionalKey(Schema.String),
});

/** Descriptor identity and JSON-safe metadata returned by the evaluator. */
export const EvaluatorDescriptorSnapshot = Schema.Struct({
  kind: Schema.String,
  id: Schema.String,
  ref: Schema.Struct({ kind: Schema.String, id: Schema.String }),
  metadata: Schema.Json,
});

/** Named or default export containing a descriptor snapshot. */
export const EvaluatorExportSnapshot = Schema.Struct({
  exportName: Schema.String,
  descriptor: EvaluatorDescriptorSnapshot,
});

/** One successfully imported module and its executable references. */
export const EvaluatorModuleResult = Schema.Struct({
  file: Schema.String,
  exports: Schema.Array(EvaluatorExportSnapshot),
  manifestReferences: Schema.Array(EvaluatorManifestReference),
});

/** Structured failure evidence emitted by the evaluator transport. */
export const EvaluatorFailure = Schema.Struct({
  code: EvaluatorFailureCode,
  message: Schema.String,
  generationId: Schema.String,
  module: Schema.optionalKey(Schema.String),
  stack: Schema.optionalKey(Schema.String),
  sideEffects: Schema.optionalKey(Schema.Array(EvaluatorSideEffect)),
  exitCode: Schema.optionalKey(Schema.Number),
  timedOut: Schema.optionalKey(Schema.Boolean),
  stdout: Schema.optionalKey(Schema.String),
  stderr: Schema.optionalKey(Schema.String),
});

/** Candidate result retains explicit undefined for the absent success/failure branch. */
export const CandidateResultSchema = Schema.Struct({
  module: Schema.UndefinedOr(EvaluatorModuleResult),
  failure: Schema.UndefinedOr(EvaluatorFailure),
  stdout: Schema.String,
  stderr: Schema.String,
});

/** Complete response validated recursively before compiler consumers read it. */
export const EvaluatorResponse = Schema.Struct({
  protocol: Schema.Literal(EVALUATOR_PROTOCOL),
  version: Schema.Literal(EVALUATOR_PROTOCOL_VERSION),
  generationId: Schema.String,
  sourceMaps: Schema.Boolean,
  detectorCoverage: EvaluatorDetectorCoverage,
  status: Schema.Literals(["ok", "failed"]),
  modules: Schema.Array(EvaluatorModuleResult),
  failures: Schema.Array(EvaluatorFailure),
  stdout: Schema.String,
  stderr: Schema.String,
});

/** Parsed final response plus the surrounding candidate output. */
export const EvaluatorFrame = Schema.Struct({ response: EvaluatorResponse, stdout: Schema.String });
