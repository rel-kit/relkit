import type { JsonValue, MaybePromise, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { InspectorActionServices } from "./actions.js";
import type {
  InspectorCandidateGenerationSource,
  ResolvedCandidateGeneration,
} from "./generation.types.js";
import type { InspectorResourceExplorers } from "./resource-explorer.js";
import type { InspectorJobsServices } from "./jobs/types.js";

/** Supported Inspector environments determining exposure, privilege and action eligibility. */
export type InspectorMode = "development" | "test" | "production";

/** Stored native value or one lazy value source; no deep schema decode is implied.
 * @typeParam T - Native successful value returned by the optional source thunk.
 */
export type InspectorValueSource<T = unknown> = T | (() => MaybePromise<T>);

/** Declared native runtime collections selected individually without private-provider traversal. */
export interface InspectorRuntimeServices {
  readonly functions?: unknown;
  readonly jobs?: unknown;
  readonly events?: unknown;
  readonly buckets?: unknown;
  readonly cache?: unknown;
  readonly caches?: unknown;
  readonly tools?: unknown;
  readonly agents?: unknown;
}

/** Declared metadata and native service sources owned by a generation. */
export interface InspectorGenerationServices extends InspectorRuntimeServices {
  readonly graph?: unknown;
  readonly descriptors?: unknown;
  readonly environment?: unknown;
  readonly diagnostics?: unknown;
  readonly integrations?: unknown;
  readonly localServices?: unknown;
  readonly telemetry?: unknown;
  readonly candidate?: unknown;
  readonly candidateGeneration?: unknown;
  readonly observedEdges?: unknown;
  readonly runtime?: InspectorRuntimeServices;
  readonly actions?: InspectorValueSource<InspectorActionServices | undefined>;
  readonly resources?: InspectorValueSource<InspectorResourceExplorers | undefined>;
}

/** Authoritative active-generation identity with its declared services and optional candidate evidence. */
export interface InspectorActiveGeneration extends InspectorGenerationServices {
  readonly jobs?: InspectorJobsServices;
  readonly generationId?: string;
  readonly id?: string;
  readonly graphHash?: string;
  readonly activationFingerprint?: RuntimeActivationFingerprint;
  readonly services?: InspectorGenerationServices;
  readonly candidate?: InspectorCandidateGenerationSource;
  readonly candidateGeneration?: InspectorCandidateGenerationSource;
}

/** Stored or lazily supplied authoritative active generation. */
export type InspectorActiveGenerationSource =
  InspectorActiveGeneration | (() => MaybePromise<InspectorActiveGeneration | undefined>);

/** Existing active-generation lookup precedence accepted by query and router owners. */
export interface ActiveGenerationOptions {
  readonly activeGeneration?: InspectorActiveGenerationSource;
  readonly generation?: InspectorActiveGenerationSource;
  readonly getActiveGeneration?: () => MaybePromise<InspectorActiveGeneration | undefined>;
}

/** Authoritative selected active identity and native service authorities after source resolution. */
export interface ResolvedActiveGeneration {
  readonly generationId: string;
  readonly graphHash: string;
  readonly activationFingerprint?: RuntimeActivationFingerprint;
  readonly graph?: unknown;
  readonly descriptors?: unknown;
  readonly diagnostics?: unknown;
  readonly observedEdges?: unknown;
  readonly integrations?: unknown;
  readonly localServices?: unknown;
  readonly telemetry?: unknown;
  readonly runtime?: InspectorRuntimeServices;
  readonly jobs?: InspectorJobsServices;
  readonly actions?: InspectorActionServices;
  readonly resources?: InspectorResourceExplorers;
  readonly candidate?: ResolvedCandidateGeneration;
}

/** Bounded public JSON page preserving the existing optional continuation cursor.
 * @typeParam T - Public item shape constrained to JsonValue.
 */
export interface Page<T extends JsonValue = JsonValue> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}
