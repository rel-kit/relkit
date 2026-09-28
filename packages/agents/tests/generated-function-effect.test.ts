import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  createGeneratedAgentFunction,
  createGeneratedAgentFunctionEffect,
  generatedAgentFunctionIdEffect,
  isGeneratedAgentFunctionEffect,
} from "../src/generated-function.js";

test("generated function Effects derive, mark, and invoke a bound handler", async () => {
  expect(Effect.runSync(generatedAgentFunctionIdEffect("support"))).toBe(
    "relkit.agent.support.invoke",
  );
  const handler = Effect.runSync(createGeneratedAgentFunctionEffect("support", (input) => input));
  expect(Effect.runSync(isGeneratedAgentFunctionEffect(handler))).toBe(true);
  expect(await handler("hello", {})).toBe("hello");
});

test("generated function Effect tags invalid identity and adapter retains the original error", () => {
  const result = Effect.runSync(Effect.result(createGeneratedAgentFunctionEffect("bad id")));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("GeneratedAgentFunctionFailure");
  expect(() => createGeneratedAgentFunction("bad id")).toThrow();
});
