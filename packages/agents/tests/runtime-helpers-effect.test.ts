import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { selectedStateSchemas, selectedStateSchemasEffect } from "../src/runtime-state-schemas.js";
import { jsonValue, jsonValueEffect, modelFailureEffect, validateValueEffect } from "../src/runtime-utils.js";

test("runtime helper Effects validate values, JSON, and selected state", async () => {
  const schema = z.object({ answer: z.string() });
  expect(await Effect.runPromise(validateValueEffect(schema, { answer: "yes" }, "output")))
    .toEqual({ answer: "yes" });
  expect(Effect.runSync(jsonValueEffect({ answer: "yes" }, 1024, "output"))).toEqual({ answer: "yes" });
  expect(jsonValue({ answer: "yes" }, 1024, "output")).toEqual({ answer: "yes" });
  const source = { fields: { answer: z.string() } };
  expect(Effect.runSync(selectedStateSchemasEffect([source], ["answer"])).get("answer"))
    .toBe(source.fields.answer);
  expect(selectedStateSchemas([source], ["answer"]).has("answer")).toBe(true);
  const error = Effect.runSync(modelFailureEffect(new Error("provider"), new AbortController().signal));
  expect(error.code).toBe("RELKIT_AGENT_MODEL_ERROR");
});

test("runtime helper Effects tag expected validation failures", async () => {
  const schema = z.object({ answer: z.string() });
  const invalid = await Effect.runPromise(Effect.result(validateValueEffect(schema, {}, "input")));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure._tag).toBe("AgentInvocationFailure");

  const missing = Effect.runSync(Effect.result(selectedStateSchemasEffect([{}], ["answer"])));
  expect(Result.isFailure(missing)).toBe(true);
  if (Result.isFailure(missing)) expect(missing.failure._tag).toBe("AgentInvocationFailure");
});
