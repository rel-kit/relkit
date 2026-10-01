import type { Schema } from "effect";
import type * as Wire from "./evaluator-protocol-schema.js";

/** Supported diagnostic code in a versioned response. */
export type EvaluatorFailureCode = Schema.Schema.Type<typeof Wire.EvaluatorFailureCode>;

/** Native effect kind recorded by the candidate hooks. */
export type EvaluatorSideEffectKind = Schema.Schema.Type<typeof Wire.EvaluatorSideEffectKind>;

/** Evidence for one blocked or observed native operation. */
export interface EvaluatorSideEffect extends Schema.Schema.Type<typeof Wire.EvaluatorSideEffect> {}

/** Supported hooks and documented bypasses of the detector. */
export interface EvaluatorDetectorCoverage extends Schema.Schema.Type<
  typeof Wire.EvaluatorDetectorCoverage
> {}

/** Source file selected for candidate evaluation. */
export interface EvaluatorCandidate extends Schema.Schema.Type<typeof Wire.EvaluatorCandidate> {}

/** Versioned child-process evaluation input. */
export interface EvaluatorRequest extends Schema.Schema.Type<typeof Wire.EvaluatorRequest> {}

/** Data-only executable lookup instruction. */
export interface EvaluatorManifestReference extends Schema.Schema.Type<
  typeof Wire.EvaluatorManifestReference
> {}

/** Directional JSON schema provenance. */
export interface EvaluatorSchemaSnapshot extends Schema.Schema.Type<
  typeof Wire.EvaluatorSchemaSnapshot
> {}

/** Descriptor identity and JSON-safe metadata. */
export interface EvaluatorDescriptorSnapshot extends Schema.Schema.Type<
  typeof Wire.EvaluatorDescriptorSnapshot
> {}

/** An evaluated module export and its descriptor. */
export interface EvaluatorExportSnapshot extends Schema.Schema.Type<
  typeof Wire.EvaluatorExportSnapshot
> {}

/** Successful module snapshots and executable references. */
export interface EvaluatorModuleResult extends Schema.Schema.Type<
  typeof Wire.EvaluatorModuleResult
> {}

/** Structured evaluator failure evidence. */
export interface EvaluatorFailure extends Schema.Schema.Type<typeof Wire.EvaluatorFailure> {}

/** Recursively validated evaluator response. */
export interface EvaluatorResponse extends Schema.Schema.Type<typeof Wire.EvaluatorResponse> {}

/** Final framed response and output surrounding it. */
export interface EvaluatorFrame extends Schema.Schema.Type<typeof Wire.EvaluatorFrame> {}
