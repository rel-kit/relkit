import { observeCompiler } from "../observability.js";
import { serializeJsonEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { EVALUATOR_FRAME } from "./evaluator-protocol-schema.js";
import { decodeEvaluatorResponse } from "./evaluator-protocol-validation.js";
import { runDiscoverySync } from "./discovery-sync.js";
import type * as Wire from "./evaluator-protocol.types.js";

export {
  EVALUATOR_FRAME,
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
} from "./evaluator-protocol-schema.js";
export type {
  EvaluatorCandidate,
  EvaluatorDescriptorSnapshot,
  EvaluatorDetectorCoverage,
  EvaluatorExportSnapshot,
  EvaluatorFailure,
  EvaluatorFailureCode,
  EvaluatorFrame,
  EvaluatorManifestReference,
  EvaluatorModuleResult,
  EvaluatorRequest,
  EvaluatorResponse,
  EvaluatorSchemaSnapshot,
  EvaluatorSideEffect,
  EvaluatorSideEffectKind,
} from "./evaluator-protocol.types.js";
export {
  isEvaluatorRequest,
  isEvaluatorResponse,
  isEvaluatorRequestEffect,
  isEvaluatorResponseEffect,
  decodeEvaluatorRequest,
  decodeEvaluatorResponse,
} from "./evaluator-protocol-validation.js";

/** Explicit supported hooks and bypasses; candidate imports are isolated in the child. */
export const EVALUATOR_DETECTOR_COVERAGE = Object.freeze({
  supported: Object.freeze([
    "Bun and common Node socket/process/network entry points",
    "global timers and direct stdout/stderr writes",
    "common Node fs mutators and Bun.write",
  ]),
  unsupported: Object.freeze([
    "native syscalls and APIs that bypass the patched entry points",
    "pre-bound named imports from CommonJS built-ins",
    "file-descriptor writes and filesystem symlink/race escapes",
    "effects scheduled after evaluation returns or outside the child process",
  ]),
});

/**
 * Serializes a trusted response using the versioned output frame.
 * @param response - Data-only evaluator response.
 * @returns A lazy effect yielding canonical framed JSON, or JsonValueError for invalid wire data.
 */
export const encodeEvaluatorFrameEffect = Effect.fn("Discovery.encodeEvaluatorFrame")(
  function* (response: Wire.EvaluatorResponse) {
    return `${EVALUATOR_FRAME}${yield* serializeJsonEffect(response)}\n`;
  },
  (effect, response) =>
    observeCompiler(
      "discovery",
      "encodeEvaluatorFrame",
      effect,
      () => ({ files: response.modules.length, diagnostics: response.failures.length }),
      false,
    ),
);

/**
 * Frames a response at the synchronous process-output boundary.
 * @param response - Data-only evaluator response.
 * @returns Canonical framed JSON with a trailing newline.
 * @throws JsonValueError when the response contains unsupported JSON data.
 */
export function encodeEvaluatorFrame(response: Wire.EvaluatorResponse): string {
  return runDiscoverySync(encodeEvaluatorFrameEffect(response));
}

/**
 * Decodes the last frame, retaining all output surrounding that frame.
 * @param stdout - Complete child stdout containing zero or more frames.
 * @returns A lazy effect yielding the valid final frame, or undefined for malformed input.
 * @remarks Only JSON syntax and schema failures become absence; defects remain visible.
 */
export const decodeEvaluatorFrameEffect = Effect.fn("Discovery.decodeEvaluatorFrame")(
  function* (stdout: string) {
    const start = stdout.lastIndexOf(EVALUATOR_FRAME);
    if (start < 0) return undefined;
    const payloadStart = start + EVALUATOR_FRAME.length;
    const payloadEnd = stdout.indexOf("\n", payloadStart);
    const payload = stdout.slice(payloadStart, payloadEnd < 0 ? stdout.length : payloadEnd);
    const parsed = yield* Effect.try({
      try: () => JSON.parse(payload) as unknown,
      catch: (error) => {
        if (error instanceof SyntaxError) return error;
        throw error;
      },
    }).pipe(Effect.result);
    if (parsed._tag === "Failure") return undefined;
    const decoded = yield* decodeEvaluatorResponse(parsed.success).pipe(Effect.result);
    if (decoded._tag === "Failure") return undefined;
    return {
      response: decoded.success,
      stdout: `${stdout.slice(0, start)}${payloadEnd < 0 ? "" : stdout.slice(payloadEnd + 1)}`,
    } satisfies Wire.EvaluatorFrame;
  },
  (effect, stdout) =>
    observeCompiler(
      "discovery",
      "decodeEvaluatorFrame",
      effect,
      () => ({ bytes: Buffer.byteLength(stdout, "utf8") }),
      false,
    ),
);

/**
 * Reads the final response frame at the synchronous compatibility boundary.
 * @param stdout - Complete child stdout.
 * @returns The valid final response with surrounding output, or undefined.
 */
export function decodeEvaluatorFrame(stdout: string): Wire.EvaluatorFrame | undefined {
  return runDiscoverySync(decodeEvaluatorFrameEffect(stdout));
}
