import { Effect, Schema } from "effect";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";
import { EvaluatorRequest, EvaluatorResponse } from "./evaluator-protocol-schema.js";
import type * as Wire from "./evaluator-protocol.types.js";

/**
 * Checks the complete request wire shape without importing candidate modules.
 * @param value - Unknown request payload.
 * @returns Whether the payload is supported and structurally valid.
 */
export function isEvaluatorRequest(value: unknown): value is Wire.EvaluatorRequest {
  return runDiscoverySync(isEvaluatorRequestEffect(value));
}

/**
 * Checks the supported request shape within a composable validation stage.
 * @param value - Unknown request payload.
 * @returns A lazy effect yielding whether the request wire contract is satisfied.
 */
export const isEvaluatorRequestEffect = Effect.fn("Discovery.isEvaluatorRequest")(
  function* (value: unknown) {
    return Schema.is(EvaluatorRequest)(value);
  },
  (effect, value) =>
    observeCompiler("discovery", "isEvaluatorRequest", effect, () => ({ schemas: 1 }), false),
);

/**
 * Checks response snapshots and diagnostic evidence recursively.
 * @param value - Unknown response payload.
 * @returns Whether all fields satisfy the supported wire contract.
 */
export function isEvaluatorResponse(value: unknown): value is Wire.EvaluatorResponse {
  return runDiscoverySync(isEvaluatorResponseEffect(value));
}

/**
 * Checks nested snapshots and diagnostics within a composable validation stage.
 * @param value - Unknown response payload.
 * @returns A lazy effect yielding whether the response wire contract is satisfied.
 */
export const isEvaluatorResponseEffect = Effect.fn("Discovery.isEvaluatorResponse")(
  function* (value: unknown) {
    return Schema.is(EvaluatorResponse)(value);
  },
  (effect) =>
    observeCompiler("discovery", "isEvaluatorResponse", effect, () => ({ schemas: 1 }), false),
);

/**
 * Decodes an unknown child request before evaluation begins.
 * @param value - Untrusted parsed JSON.
 * @returns A lazy effect yielding a request or failing with SchemaError.
 */
export const decodeEvaluatorRequest = Effect.fn("Discovery.decodeEvaluatorRequest")(
  function* (value: unknown) {
    return yield* Schema.decodeUnknownEffect(EvaluatorRequest)(value);
  },
  (effect, value) =>
    observeCompiler("discovery", "decodeEvaluatorRequest", effect, () => ({ schemas: 1 }), false),
);

/**
 * Decodes unknown response data before compiler consumers access nested values.
 * @param value - Untrusted parsed JSON.
 * @returns A lazy effect yielding a response or failing with SchemaError.
 */
export const decodeEvaluatorResponse = Effect.fn("Discovery.decodeEvaluatorResponse")(
  function* (value: unknown) {
    return yield* Schema.decodeUnknownEffect(EvaluatorResponse)(value);
  },
  (effect) =>
    observeCompiler("discovery", "decodeEvaluatorResponse", effect, () => ({ schemas: 1 }), false),
);
