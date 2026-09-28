import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  hitlResponseSchema,
  hitlResponseSchemaEffect,
  isDecisionEffect,
  isHitlRequestEffect,
  isRecordEffect,
  publicHitlRequestEffect,
} from "../src/native-agent-interruption-schema.js";

const request = {
  actionRequests: [{ name: "pay", args: { amount: 1 }, secret: "hidden" }],
  reviewConfigs: [{ actionName: "pay", allowedDecisions: ["approve", "reject"] as const }],
};

test("native HITL schema Effects project only public fields", () => {
  expect(Effect.runSync(isHitlRequestEffect(request))).toBe(true);
  expect(Effect.runSync(isDecisionEffect("approve"))).toBe(true);
  expect(Effect.runSync(isRecordEffect([]))).toBe(false);
  expect(Effect.runSync(publicHitlRequestEffect(request)).actionRequests[0]).toEqual({
    name: "pay", args: { amount: 1 },
  });
  expect(Effect.runSync(hitlResponseSchemaEffect(request.reviewConfigs))).toEqual(
    hitlResponseSchema(request.reviewConfigs),
  );
});
