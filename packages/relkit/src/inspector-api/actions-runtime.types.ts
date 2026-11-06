import type { Deferred, Effect } from "effect";
import type { InspectorActionRequest } from "./actions.js";
import type { InspectorMode, ResolvedActiveGeneration } from "./shared.js";
import type { InspectorControlFailure } from "./native-edge.types.js";
import type { InspectorBoundaryError } from "./native-edge.js";

/** Successful action receipt and the fingerprint used by authoritative deduplication. */
export interface InspectorActionResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly fingerprint: string;
}

/** Native authorities retained by a control invocation. */
export interface InspectorActionExecutionOptions {
  readonly mode: InspectorMode;
  readonly getGeneration: () => Promise<ResolvedActiveGeneration | undefined>;
  /** Lazy router-owned resolution avoids reentering a compatibility runtime. */
  readonly generationEffect?: Effect.Effect<
    ResolvedActiveGeneration | undefined,
    InspectorBoundaryError
  >;
  readonly idempotency?: Map<string, Promise<InspectorActionResult>>;
}

/** Owner-held receipt; completion retains both success and failure without eviction. */
export interface InspectorActionEntry {
  readonly fingerprint: string;
  readonly result: Deferred.Deferred<InspectorActionResult, InspectorControlFailure>;
}

/** Action ownership contract implemented by live and deterministic test layers. */
export interface InspectorControlService {
  readonly execute: (
    request: InspectorActionRequest,
    options: InspectorActionExecutionOptions,
  ) => Effect.Effect<InspectorActionResult, InspectorControlFailure>;
}
