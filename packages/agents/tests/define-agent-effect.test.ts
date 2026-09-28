import { IdentityStore } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { defineAgent, defineAgentEffect } from "../src/define-agent.js";

const options = {
  input: z.object({ question: z.string() }),
  output: z.object({ answer: z.string() }),
  instructions: "Answer.",
  tools: [],
  limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1000 },
};

test("defineAgent Effect uses a substituted identity store", () => {
  const store = {
    canonical: new WeakMap(),
    unbound: new WeakMap(),
    services: new WeakMap(),
    nextUnboundId: () => "fixed",
  };
  const agent = Effect.runSync(Effect.provideService(defineAgentEffect(options), IdentityStore, store));
  expect(agent.id).toBe("unbound.fixed");
  expect(Object.isFrozen(agent)).toBe(true);
});

test("defineAgent Effect tags invalid options and adapter retains TypeError", () => {
  const invalid = { ...options, limits: { ...options.limits, maxSteps: 0 } };
  let generated = 0;
  const result = Effect.runSync(Effect.result(Effect.provideService(
    defineAgentEffect(invalid),
    IdentityStore,
    {
      canonical: new WeakMap(),
      unbound: new WeakMap(),
      services: new WeakMap(),
      nextUnboundId: () => { generated += 1; return "unused"; },
    },
  )));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentDefinitionFailure");
  expect(generated).toBe(0);
  expect(() => defineAgent(invalid)).toThrow("limits.maxSteps must be a finite positive integer");
});

test("defineAgent Effect rejects non-records and handlers before identity lookup", () => {
  const nonRecord = Effect.runSync(Effect.flip(defineAgentEffect(null as never)));
  const handler = Effect.runSync(Effect.flip(defineAgentEffect({
    ...options, handler: () => undefined,
  } as never)));
  expect(nonRecord).toMatchObject({ _tag: "AgentDefinitionFailure" });
  expect(handler).toMatchObject({ _tag: "AgentDefinitionFailure" });
  expect(Effect.runSync(defineAgentEffect({ ...options, id: "explicit" })).id)
    .toBe("explicit");
});
