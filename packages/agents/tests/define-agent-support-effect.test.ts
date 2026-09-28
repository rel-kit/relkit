import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  copyAgentInstructions,
  copyAgentInstructionsEffect,
  isAgentInstructionsEffect,
} from "../src/define-agent-support.js";

test("instruction Effects accept text, templates, and prompt descriptors", () => {
  expect(Effect.runSync(copyAgentInstructionsEffect("  Answer.  "))).toBe("Answer.");
  expect(
    Effect.runSync(
      copyAgentInstructionsEffect({
        template: "Hello {name}",
        variables: ["name"],
      }),
    ),
  ).toEqual({ template: "Hello {name}", variables: ["name"] });
  const prompt = {
    kind: "prompt",
    id: "greeting",
    ref: { kind: "prompt", id: "greeting" },
    value: ["Hi"],
  };
  expect(Effect.runSync(copyAgentInstructionsEffect(prompt))).toBe(prompt);
  expect(Effect.runSync(isAgentInstructionsEffect(prompt))).toBe(true);
  expect(Effect.runSync(isAgentInstructionsEffect({ template: " ", variables: [] }))).toBe(false);
});

test("instruction Effect has a tagged failure and adapter preserves the original error", () => {
  const input = { template: "Hello", variables: ["name", "name"] };
  const result = Effect.runSync(Effect.result(copyAgentInstructionsEffect(input)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toMatchObject({ _tag: "AgentDefinitionFailure" });
  }
  expect(() => copyAgentInstructions(input)).toThrow("template.variables must be unique");
});
