import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  decodeEvaluatorFrame,
  decodeEvaluatorRequest,
  encodeEvaluatorFrame,
  EVALUATOR_DETECTOR_COVERAGE,
  EVALUATOR_FRAME,
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
  isEvaluatorRequest,
  isEvaluatorResponse,
} from "../../src/discovery/evaluator-protocol.js";
import type {
  EvaluatorRequest,
  EvaluatorResponse,
} from "../../src/discovery/evaluator-protocol.types.js";

const request: EvaluatorRequest = {
  protocol: EVALUATOR_PROTOCOL,
  version: EVALUATOR_PROTOCOL_VERSION,
  generationId: "protocol-test",
  projectRoot: "/project",
  candidates: [{ file: "app.ts" }],
  environmentAllowlist: [],
  generatedDirectory: ".relkit/generated",
  networkAllowlist: [],
  sourceMaps: true,
  timeoutMs: 100,
};

const response: EvaluatorResponse = {
  protocol: EVALUATOR_PROTOCOL,
  version: EVALUATOR_PROTOCOL_VERSION,
  generationId: request.generationId,
  sourceMaps: true,
  detectorCoverage: EVALUATOR_DETECTOR_COVERAGE,
  status: "ok",
  modules: [
    {
      file: "app.ts",
      exports: [
        {
          exportName: "app",
          descriptor: {
            kind: "app",
            id: "app",
            ref: { kind: "app", id: "app" },
            metadata: { handler: { $relkit: "function" } },
          },
        },
      ],
      manifestReferences: [
        {
          generationId: request.generationId,
          descriptorId: "app",
          kind: "app",
          module: "app.ts",
          exportName: "app",
        },
      ],
    },
  ],
  failures: [],
  stdout: "",
  stderr: "",
};

describe("evaluator wire contracts", () => {
  it.effect("decodes a request without evaluating candidate modules", () =>
    Effect.gen(function* () {
      expect(yield* decodeEvaluatorRequest(request)).toEqual(request);
      expect(isEvaluatorRequest(request)).toBe(true);
    }),
  );

  it.effect("reports unsupported envelopes and nested request values as typed failures", () =>
    Effect.gen(function* () {
      for (const invalid of [
        { ...request, version: 2 },
        { ...request, candidates: [{ file: 1 }] },
        { ...request, environmentAllowlist: [false] },
      ]) {
        const error = yield* Effect.flip(decodeEvaluatorRequest(invalid));
        expect(error).toBeInstanceOf(Schema.SchemaError);
        expect(isEvaluatorRequest(invalid)).toBe(false);
      }
    }),
  );

  it.effect("retains surrounding output while decoding the last valid response", () =>
    Effect.sync(() => {
      const first = encodeEvaluatorFrame({ ...response, generationId: "earlier" });
      const frame = encodeEvaluatorFrame(response);
      expect(decodeEvaluatorFrame(`before\n${first}between\n${frame}after\n`)).toEqual({
        response,
        stdout: `before\n${first}between\nafter\n`,
      });
      expect(decodeEvaluatorFrame(frame.trimEnd())?.response).toEqual(response);
    }),
  );

  it.effect("rejects malformed final frames without accepting an earlier valid frame", () =>
    Effect.sync(() => {
      const valid = encodeEvaluatorFrame(response);
      for (const suffix of ["{", "null", JSON.stringify({ ...response, version: 2 })]) {
        expect(decodeEvaluatorFrame(`${valid}${EVALUATOR_FRAME}${suffix}\n`)).toBeUndefined();
      }
      expect(decodeEvaluatorFrame("candidate output only")).toBeUndefined();
    }),
  );

  it.effect("rejects malformed snapshots and diagnostics before callers consume them", () =>
    Effect.sync(() => {
      for (const invalid of [
        { ...response, modules: [null] },
        { ...response, modules: [{ file: "app.ts", exports: [null], manifestReferences: [] }] },
        { ...response, modules: [{ file: "app.ts", exports: [], manifestReferences: [{}] }] },
        { ...response, failures: [null] },
        { ...response, failures: [{ code: "unknown", message: "bad", generationId: "test" }] },
        {
          ...response,
          failures: [
            {
              code: "RELKIT_EVALUATOR_SIDE_EFFECT",
              message: "bad",
              generationId: "test",
              sideEffects: [{ kind: "unknown", operation: "x", target: "y" }],
            },
          ],
        },
      ]) {
        expect(isEvaluatorResponse(invalid)).toBe(false);
        expect(
          decodeEvaluatorFrame(`${EVALUATOR_FRAME}${JSON.stringify(invalid)}\n`),
        ).toBeUndefined();
      }
    }),
  );

  it.effect("accepts full failure evidence without changing the wire shape", () =>
    Effect.sync(() => {
      const failed: EvaluatorResponse = {
        ...response,
        status: "failed",
        modules: [],
        failures: [
          {
            code: "RELKIT_EVALUATOR_SIDE_EFFECT",
            message: "blocked",
            generationId: request.generationId,
            module: "app.ts",
            sideEffects: [{ kind: "child-process", operation: "spawn", target: "true" }],
            exitCode: 1,
            timedOut: false,
            stdout: "out",
            stderr: "err",
            stack: "app.ts:1",
          },
        ],
      };
      expect(isEvaluatorResponse(failed)).toBe(true);
      expect(decodeEvaluatorFrame(encodeEvaluatorFrame(failed))?.response).toEqual(failed);
    }),
  );
});
