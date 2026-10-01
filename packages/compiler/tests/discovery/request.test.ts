import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
  createEvaluatorRequest,
  createEvaluatorRequestEffect,
  allowlistedEnvironmentEffect,
} from "../../src/discovery/evaluator-request.js";
describe("evaluator request construction", () => {
  it.effect("inherits only allowlisted configuration values and preserves empty strings", () =>
    Effect.gen(function* () {
      const environment = yield* allowlistedEnvironmentEffect(["PRESENT", "EMPTY", "MISSING"]).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnvRecord(
            { PRESENT: "value", EMPTY: "", PRIVATE: "hidden" },
            { preserveEmptyStrings: true },
          ),
        ),
      );
      expect(environment).toEqual({ PRESENT: "value", EMPTY: "" });
    }),
  );

  it.effect("normalizes paths, ordered allowlists, and first-seen candidate identity", () =>
    Effect.gen(function* () {
      const projectRoot = realpathSync(process.cwd());
      const request = yield* createEvaluatorRequestEffect({
        projectRoot,
        generationId: "request-test",
        candidates: ["a.ts", { fileName: resolve(projectRoot, "b.ts") }, "a.ts"],
        environmentAllowlist: ["Z", "A", "Z"],
        networkAllowlist: ["z.example", "a.example", "z.example"],
      });
      expect(request.candidates).toEqual([{ file: "a.ts" }, { file: "b.ts" }]);
      expect(request.environmentAllowlist).toEqual(["A", "Z"]);
      expect(request.networkAllowlist).toEqual(["a.example", "z.example"]);
      expect(request.timeoutMs).toBe(10_000);
      expect(request.sourceMaps).toBe(true);
      expect(request.generatedDirectory).toBe(".relkit/generated");
      for (const list of [
        request.candidates,
        request.environmentAllowlist,
        request.networkAllowlist,
      ]) {
        expect(Object.isFrozen(list)).toBe(true);
      }
    }),
  );
  for (const [override, message] of [
    [{ projectRoot: "relative" }, "projectRoot must be absolute"],
    [{ timeoutMs: 0 }, "timeoutMs must be positive"],
    [{ timeoutMs: 1.5 }, "timeoutMs must be positive"],
    [{ generationId: "bad identity" }, "generationId is invalid"],
    [{ environmentAllowlist: ["bad-name"] }, "environmentAllowlist contains an invalid name"],
    [{ networkAllowlist: ["host/path"] }, "networkAllowlist contains an invalid host"],
  ] as const) {
    it.effect(`preserves the validation diagnostic: ${message} ${JSON.stringify(override)}`, () =>
      Effect.gen(function* () {
        const options = Object.assign({ projectRoot: process.cwd(), candidates: [] }, override);
        const error = yield* Effect.flip(createEvaluatorRequestEffect(options));
        expect(error).toBeInstanceOf(TypeError);
        expect(error instanceof TypeError && error.message).toBe(message);
        expect(() => createEvaluatorRequest(options)).toThrow(message);
      }),
    );
  }
  it.effect("keeps path boundary failures in the request failure channel", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        createEvaluatorRequestEffect({
          projectRoot: process.cwd(),
          generationId: "request-test",
          candidates: ["../outside.ts"],
        }),
      );
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toMatch(/outside|escape|relative/i);
    }),
  );
  it.effect("preserves unexpected normalization defects", () =>
    Effect.gen(function* () {
      const defect = new Error("candidate accessor defect");
      const exit = yield* Effect.exit(
        createEvaluatorRequestEffect({
          projectRoot: process.cwd(),
          generationId: "request-test",
          candidates: [
            {
              get fileName(): string {
                throw defect;
              },
            },
          ],
        }),
      );
      expect(Exit.hasDies(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(
          exit.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === defect),
        ).toBe(true);
      }
    }),
  );
});
