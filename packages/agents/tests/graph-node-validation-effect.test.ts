import { END } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  assertGraphNodeDestinations,
  assertGraphNodeDestinationsEffect,
  copyGraphNodeEndsEffect,
  validateGraphNodeResultEffect,
  validatedGraphNodeInputEffect,
} from "../src/graph-node-validation.js";
import {
  commandUpdate, commandUpdateEffect, validatedUpdate, validatedUpdateEffect,
  validatedValueEffect, validateDestinations, validateDestinationsEffect,
} from "../src/graph-node-validation-value.js";

test("graph node validation Effects normalize destinations and validate schemas", async () => {
  expect(Effect.runSync(copyGraphNodeEndsEffect([END]))).toEqual([END]);
  expect(Effect.runSync(assertGraphNodeDestinationsEffect(
    { id: "node", ends: ["next", END] }, new Set(["next"]),
  ))).toBeUndefined();
  expect(await Effect.runPromise(validatedGraphNodeInputEffect(z.string(), "hello"))).toBe("hello");
  expect(await Effect.runPromise(validateGraphNodeResultEffect(
    z.object({ answer: z.string() }), [], { answer: "yes" },
  ))).toEqual({ answer: "yes" });
});

test("graph node Effect tags invalid destinations and adapter retains TypeError", () => {
  const node = { id: "node", ends: ["missing"] };
  const result = Effect.runSync(Effect.result(assertGraphNodeDestinationsEffect(node, new Set())));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("GraphNodeValidationFailure");
  expect(() => assertGraphNodeDestinations(node, new Set())).toThrow(TypeError);
});

test("graph node value Effects convert updates and tag invalid schema values", async () => {
  expect(Effect.runSync(commandUpdateEffect([["answer", "yes"]]))).toEqual({ answer: "yes" });
  expect(Effect.runSync(validateDestinationsEffect(["next"], "next"))).toBeUndefined();
  const failure = await Effect.runPromise(Effect.result(validatedValueEffect(z.string(), 42, "input")));
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("GraphNodeValidationFailure");
});

test("graph node value Effects validate object destinations and update records", async () => {
  expect(Effect.runSync(validateDestinationsEffect(
    ["next"], [{ node: "next" }],
  ))).toBeUndefined();
  expect(() => validateDestinations(["next"], { node: "other" }))
    .toThrow('destination "other" is not declared');
  expect(() => validateDestinations(["next"], { node: 7 }))
    .toThrow("invalid destination");
  expect(commandUpdate({ answer: "yes" })).toEqual({ answer: "yes" });
  const invalidUpdate = Effect.runSync(Effect.flip(commandUpdateEffect([["answer"]])));
  expect(invalidUpdate).toMatchObject({ _tag: "GraphNodeValidationFailure" });
  expect(() => commandUpdate([["answer"]])).toThrow("invalid update");
  const schema = z.any();
  const invalidOutput = await Effect.runPromise(Effect.flip(validatedUpdateEffect(schema, "text")));
  expect(invalidOutput).toMatchObject({ _tag: "GraphNodeValidationFailure" });
  await expect(validatedUpdate(schema, "text")).rejects.toThrow("output must be an object");
});
