import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  ContextDescriptorFailure,
  defineConstants,
  defineConstantsEffect,
  definePrompt,
  definePromptEffect,
} from "../src/context-descriptors.js";

test("invalid explicit IDs retain StableIdError in both descriptor APIs", () => {
  const constants = Effect.runSync(
    Effect.result(defineConstantsEffect({ ok: true }, { id: 1 } as never)),
  );
  const prompt = Effect.runSync(Effect.result(definePromptEffect("yes", { id: 1 } as never)));
  expect(Result.isFailure(constants)).toBe(true);
  expect(Result.isFailure(prompt)).toBe(true);
  if (Result.isFailure(constants)) {
    expect(constants.failure).toBeInstanceOf(ContextDescriptorFailure);
    expect(constants.failure.cause).toMatchObject({ name: "StableIdError" });
  }
  if (Result.isFailure(prompt)) {
    expect(prompt.failure).toBeInstanceOf(ContextDescriptorFailure);
    expect(prompt.failure.cause).toMatchObject({ name: "StableIdError" });
  }
  expect(defineConstants({ ok: true }, { id: null } as never).id).toMatch(/^unbound\./);
  expect(definePrompt("yes", { id: null } as never).id).toMatch(/^unbound\./);
});

test("malformed prompt fragments fail through the typed Effect channel", () => {
  const result = Effect.runSync(Effect.result(definePromptEffect([1] as never)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(ContextDescriptorFailure);
    expect(result.failure.message).toContain("nonempty text");
  }
  expect(() => definePrompt([1] as never)).toThrow("nonempty text");
});
