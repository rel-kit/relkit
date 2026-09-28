import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  createNativeToolsEffect, NativeToolIdentity, NativeToolIdentityLive,
} from "../src/runtime-native-tools.js";

const identity = { randomUUID: () => "fixed-call" };
const signal = new AbortController().signal;

test("native tool factory Effect maps native tool names", () => {
  const native = { name: "search", invoke: async () => "ok" };
  const options = { agent: { tools: [native] }, tools: [] } as never;
  const created = Effect.runSync(Effect.provideService(
    createNativeToolsEffect(options, signal, 1024, "invocation", "trace"),
    NativeToolIdentity, identity,
  ));
  expect(created.values).toEqual([native]);
  expect(created.publicIds.get("search")).toBe("search");
});

test("native tool factory Effect tags an unregistered RELKIT tool", () => {
  const options = { agent: { tools: [{ ref: { kind: "tool", id: "missing" } }] }, tools: [] } as never;
  const failure = Effect.runSync(Effect.result(Effect.provideService(
    createNativeToolsEffect(options, signal, 1024, "invocation", "trace"),
    NativeToolIdentity, identity,
  )));
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("AgentInvocationFailure");
});

test("native tool identity live Layer supplies UUIDs", () => {
  const id = Effect.runSync(Effect.provide(Effect.gen(function* () {
    const service = yield* NativeToolIdentity;
    return service.randomUUID();
  }), NativeToolIdentityLive));
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
