import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  resolveAgentContentLimitsEffect,
  resolveRuntimeModel,
  resolveRuntimeModelEffect,
} from "../src/runtime-model.js";

test("model resolution Effect uses a supplied factory and environment", async () => {
  const model = { invoke: () => undefined };
  const resolved = await Effect.runPromise(
    resolveRuntimeModelEffect({
      model: (environment) => {
        expect(environment.API_KEY).toBe("test");
        return model;
      },
      registry: null,
      environment: { API_KEY: "test" },
      maxInputBytes: 1024,
    }),
  );
  expect(resolved.model).toBe(model);
  expect(resolved.maxInputBytes).toBe(1024);
  expect(Effect.runSync(resolveAgentContentLimitsEffect({}))).toEqual({
    maxInputBytes: 64 * 1024,
    maxOutputBytes: 16 * 1024,
  });
});

test("model resolution Effect tags unavailable models and adapter keeps runtime error", async () => {
  const options = { registry: null, environment: {} };
  const result = await Effect.runPromise(Effect.result(resolveRuntimeModelEffect(options)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentModelResolutionFailure");
  await expect(resolveRuntimeModel(options)).rejects.toMatchObject({
    code: "RELKIT_AGENT_MODEL_UNAVAILABLE",
  });
});
