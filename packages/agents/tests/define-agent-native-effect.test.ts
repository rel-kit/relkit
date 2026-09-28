import { MIDDLEWARE_BRAND } from "langchain";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  copyAgentMiddleware,
  copyAgentMiddlewareEffect,
  middlewareStateKeysEffect,
} from "../src/define-agent-native-middleware.js";
import {
  copyAgentTools,
  copyAgentToolsEffect,
  relkitToolRefsEffect,
} from "../src/define-agent-native-tools.js";
import { isAgentModelEffect } from "../src/define-agent-native-model.js";

test("native authoring Effects copy middleware and select public state", () => {
  const middleware = [
    {
      [MIDDLEWARE_BRAND]: true as const,
      name: "context",
      stateSchema: { fields: { visible: {}, _private: {} } },
    },
  ];
  const copied = Effect.runSync(copyAgentMiddlewareEffect(middleware));
  expect(Object.isFrozen(copied)).toBe(true);
  expect([...Effect.runSync(middlewareStateKeysEffect(copied))]).toEqual(["visible", "_private"]);
  expect(Effect.runSync(isAgentModelEffect({ invoke() {} }))).toBe(true);
  expect(Effect.runSync(isAgentModelEffect({}))).toBe(false);
});

test("native authoring Effects tag duplicate definitions and preserve adapters", () => {
  const duplicate = [
    { [MIDDLEWARE_BRAND]: true as const, name: "same" },
    { [MIDDLEWARE_BRAND]: true as const, name: "same" },
  ];
  const result = Effect.runSync(Effect.result(copyAgentMiddlewareEffect(duplicate)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentDefinitionFailure");
  expect(() => copyAgentMiddleware(duplicate)).toThrow("Duplicate agent middleware");
  const tools = [{ ref: { kind: "tool" as const, id: "one" } }];
  expect(Effect.runSync(copyAgentToolsEffect(tools))).toEqual(tools);
  expect(Effect.runSync(relkitToolRefsEffect(tools))).toHaveLength(1);
  expect(() => copyAgentTools([tools[0], tools[0]])).toThrow("Duplicate agent tool");
});
