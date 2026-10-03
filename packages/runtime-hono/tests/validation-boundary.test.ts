import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { httpValidation } from "../src/http-validation.js";
import { requireAgentThreadId } from "../src/agent-request-validation.js";

it.effect(
  "keeps declared input validation in the failure channel and internal throws as defects",
  () =>
    Effect.gen(function* () {
      const invalid = yield* Effect.exit(
        httpValidation("agent.threadId", () => requireAgentThreadId(" ")),
      );
      expect(Exit.isFailure(invalid) && Cause.hasFails(invalid.cause)).toBe(true);
      const defect = yield* Effect.exit(
        Effect.sync(() => {
          throw new Error("programmer defect");
        }),
      );
      expect(Exit.isFailure(defect) && Cause.hasDies(defect.cause)).toBe(true);
    }),
);
