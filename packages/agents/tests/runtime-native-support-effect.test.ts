import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { createNativeLimitMiddlewareEffect } from "../src/runtime-native-limits.js";
import {
  assertAgentRuntimeDependenciesEffect,
  combineNativeToolsEffect,
  DeepAgentsLoader,
  loadDeepAgentsEffect,
  nativeInstructions,
  nativeInstructionsEffect,
} from "../src/runtime-native-support.js";

test("native support Effect substitutes the optional module loader", async () => {
  const module = { createDeepAgent: () => undefined } as never;
  let calls = 0;
  const loader = { load: async () => { calls += 1; return module; } };
  expect(await Effect.runPromise(Effect.provideService(loadDeepAgentsEffect(), DeepAgentsLoader, loader)))
    .toBe(module);
  await Effect.runPromise(Effect.provideService(assertAgentRuntimeDependenciesEffect([]), DeepAgentsLoader, loader));
  expect(calls).toBe(1);

  const failed = await Effect.runPromise(Effect.result(Effect.provideService(
    loadDeepAgentsEffect(), DeepAgentsLoader, { load: () => Promise.reject(new Error("missing")) },
  )));
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isFailure(failed)) expect(failed.failure._tag).toBe("AgentInvocationFailure");
});

test("native support Effects combine tool groups and build invocation limits", () => {
  const group = {
    values: [], publicIds: new Map([["tool", "tool.id"]]),
    relkitNames: new Set(["tool"]), failure: () => undefined,
  };
  const combined = Effect.runSync(combineNativeToolsEffect([group]));
  expect(combined.publicIds.get("tool")).toBe("tool.id");
  expect(combined.failure()).toBeUndefined();
  const limits = Effect.runSync(createNativeLimitMiddlewareEffect({
    maxSteps: 1, maxToolCalls: 1, timeoutMs: 1000,
  }));
  expect(limits.name).toBe("RelkitInvocationLimits");
});

test("native support Effects project prompt forms and prioritize tool failures", async () => {
  expect(Effect.runSync(nativeInstructionsEffect({ instructions: "Plain" } as never)))
    .toBe("Plain");
  expect(nativeInstructions({ instructions: { template: "Template" } } as never))
    .toBe("Template");
  expect(Effect.runSync(nativeInstructionsEffect({
    instructions: { value: ["First", "Second"] },
  } as never))).toBe("First\n\nSecond");

  const first = {
    values: [], publicIds: new Map([["first", "one"]]),
    relkitNames: new Set(["first"]), failure: () => undefined,
  };
  const second = {
    values: [], publicIds: new Map([["second", "two"]]),
    relkitNames: new Set(["second"]), failure: () => new Error("tool failed"),
  };
  const combined = Effect.runSync(combineNativeToolsEffect([first, second]));
  expect([...combined.publicIds]).toEqual([["first", "one"], ["second", "two"]]);
  expect(combined.failure()).toBeInstanceOf(Error);
  const invalid = Effect.runSync(Effect.flip(combineNativeToolsEffect([])));
  expect(invalid).toMatchObject({ _tag: "AgentInvocationFailure" });
});

test("native dependency check loads DeepAgents when capabilities are present", async () => {
  let calls = 0;
  const loader = { load: async () => {
    calls += 1;
    return { createDeepAgent: () => undefined } as never;
  } };
  await Effect.runPromise(Effect.provideService(
    assertAgentRuntimeDependenciesEffect([{ skills: [] } as never]),
    DeepAgentsLoader, loader,
  ));
  expect(calls).toBe(1);
});
