import { MemorySaver } from "@langchain/langgraph";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  assertPersistenceProtocolEffect,
  defineCheckpointerDb,
  defineCheckpointerDbEffect,
  isPersistenceResourceEffect,
} from "../src/define-persistence.js";

test("persistence definition Effects create and recognize a lazy resource", async () => {
  let creates = 0;
  const resource = Effect.runSync(defineCheckpointerDbEffect({
    id: "effect.checkpointer",
    client: () => { creates += 1; return new MemorySaver(); },
    dispose: () => undefined,
  }));
  expect(creates).toBe(0);
  expect(Effect.runSync(isPersistenceResourceEffect(resource))).toBe(true);
  const saver = await resource.acquire({ env: {} });
  expect(creates).toBe(1);
  expect(Effect.runSync(assertPersistenceProtocolEffect("checkpointer", saver))).toBeUndefined();
  await resource.release();
});

test("persistence definition Effect tags invalid ownership and adapter retains TypeError", () => {
  const invalid = { id: "owned", client: new MemorySaver(), ownership: "owned" as const };
  const result = Effect.runSync(Effect.result(defineCheckpointerDbEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentPersistenceFailure");
  expect(() => defineCheckpointerDb(invalid)).toThrow("requires dispose");
});
