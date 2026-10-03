import type {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  MaybePromise,
  RuntimeActivationFingerprint,
  RuntimeIntegrationPlanReference,
} from "@relkit/contracts";
import type { ApplicationGraph, GraphCanonicalizationOptions } from "@relkit/graph";
import type { InvocationTarget } from "./invoke-types.js";

/** Opaque manifest callable; target schemas validate its native arguments. */
export type FunctionHandler = (...arguments_: readonly unknown[]) => MaybePromise<unknown>;

/** Supported manifest handler collection shapes, normalized during verification. */
export type RuntimeHandlerEntries =
  | Readonly<Record<string, FunctionHandler>>
  | ReadonlyMap<string, FunctionHandler>
  | readonly (readonly [string, FunctionHandler])[];

/** Manifest identity, handlers and artifact fingerprints verified against the graph. */
export interface RuntimeManifestInput {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly runtimeIntegrationsPlan: RuntimeIntegrationPlanReference;
  readonly functions: RuntimeHandlerEntries;
  readonly targets?: Readonly<Record<string, unknown>>;
}

/** Graph and generated manifest cohort to verify as one generation. */
export interface FunctionRegistryOptions extends GraphCanonicalizationOptions {
  readonly graph: ApplicationGraph;
  readonly manifest: RuntimeManifestInput;
}

/** Stable public diagnostic codes for graph and manifest mismatches. */
export type RegistryErrorCode =
  | "RELKIT_GRAPH_INVALID"
  | "RELKIT_GRAPH_VERSION_UNSUPPORTED"
  | "RELKIT_MANIFEST_VERSION_UNSUPPORTED"
  | "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED"
  | "RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID"
  | "RELKIT_RUNTIME_ACTIVATION_FINGERPRINT_INVALID"
  | "RELKIT_GRAPH_MANIFEST_MISMATCH"
  | "RELKIT_GRAPH_FUNCTION_DUPLICATE"
  | "RELKIT_MANIFEST_HANDLER_MISSING"
  | "RELKIT_MANIFEST_HANDLER_EXTRA"
  | "RELKIT_MANIFEST_HANDLER_DUPLICATE"
  | "RELKIT_MANIFEST_HANDLER_INVALID";

/** One safe graph/manifest diagnostic with an optional function identity. */
export interface RegistryIssue {
  readonly code: RegistryErrorCode;
  readonly message: string;
  readonly functionId?: string;
}

/** Immutable verified handler lookup and canonical invocation targets. */
export interface FunctionRegistry extends ReadonlyMap<string, FunctionHandler> {
  readonly graphHash: string;
  readonly functionIds: readonly string[];
  readonly handlers: Readonly<Record<string, FunctionHandler>>;
  readonly targets: Readonly<Record<string, InvocationTarget>>;
}
