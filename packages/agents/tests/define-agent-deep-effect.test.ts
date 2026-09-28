import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  copyDeepAgentCapabilities,
  copyDeepAgentCapabilitiesEffect,
  hasDeepAgentCapabilitiesEffect,
} from "../src/define-agent-deep.js";

test("DeepAgent Effects copy and detect native capabilities", () => {
  const copied = Effect.runSync(copyDeepAgentCapabilitiesEffect({
    skills: ["/skills/triage"],
    memory: ["/memory/user"],
  }));
  expect(copied).toEqual({ skills: ["/skills/triage"], memory: ["/memory/user"] });
  expect(Object.isFrozen(copied)).toBe(true);
  expect(Effect.runSync(hasDeepAgentCapabilitiesEffect(copied))).toBe(true);
  expect(Effect.runSync(hasDeepAgentCapabilitiesEffect({}))).toBe(false);
});

test("DeepAgent Effect tags invalid capabilities and adapter preserves TypeError", () => {
  const invalid = { skills: ["/same", "/same"] };
  const result = Effect.runSync(Effect.result(copyDeepAgentCapabilitiesEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentDefinitionFailure");
  expect(() => copyDeepAgentCapabilities(invalid)).toThrow(TypeError);
});
