import { describe, expect, it } from "@effect/vitest";
import { JsonValueError } from "@relkit/contracts";
import { Effect } from "effect";
import {
  encodeEvaluatorFrame,
  encodeEvaluatorFrameEffect,
  EVALUATOR_DETECTOR_COVERAGE,
} from "../../src/discovery/evaluator-protocol.js";
import type {
  EvaluatorRequest,
  EvaluatorResponse,
} from "../../src/discovery/evaluator-protocol.types.js";
import { runEvaluatorProcess } from "../../src/discovery/evaluator-process.js";
import { makeProcess } from "./process-fixture.js";

describe("evaluator serialization boundaries", () => {
  it.effect("retains JSON failures in the frame channel and synchronous adapter", () =>
    Effect.gen(function* () {
      const response: EvaluatorResponse = {
        protocol: "relkit.evaluator",
        version: 1,
        generationId: "test",
        sourceMaps: true,
        detectorCoverage: EVALUATOR_DETECTOR_COVERAGE,
        status: "ok",
        modules: [],
        failures: [],
        stdout: "",
        stderr: "",
      };
      // Model a runtime caller violating the otherwise typed JSON wire contract.
      Object.defineProperty(response, "stdout", { value: undefined });
      expect(yield* Effect.flip(encodeEvaluatorFrameEffect(response))).toBeInstanceOf(
        JsonValueError,
      );
      expect(() => encodeEvaluatorFrame(response)).toThrow(JsonValueError);
    }),
  );
  it.effect("reaps an acquired child when request serialization fails before stdin", () =>
    Effect.gen(function* () {
      const request: EvaluatorRequest = {
        protocol: "relkit.evaluator",
        version: 1,
        generationId: "test",
        projectRoot: "/test",
        candidates: [],
        environmentAllowlist: [],
        generatedDirectory: ".relkit/generated",
        networkAllowlist: [],
        sourceMaps: true,
        timeoutMs: 100,
      };
      Object.defineProperty(request, "generationId", { value: undefined });
      const fake = makeProcess();
      const error = yield* Effect.flip(runEvaluatorProcess(request, "/child", () => fake.process));
      expect(error.operation).toBe("stdin");
      expect(error.cause).toBeInstanceOf(JsonValueError);
      expect(fake.writes).toEqual([]);
      expect(fake.signals).toEqual(["SIGKILL"]);
      expect(fake.process.exitCode).toBe(137);
    }),
  );
});
