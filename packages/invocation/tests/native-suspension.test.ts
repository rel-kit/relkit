import { describe, expect, test } from "vitest";
import { Effect, Exit, Layer } from "effect";
import {
  InvocationTelemetry,
  NativeSuspension,
  findNativeSuspension,
  findNativeSuspensionEffect,
  isNativeSuspension,
  isNativeSuspensionEffect,
  markNativeSuspension,
  markNativeSuspensionEffect,
} from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("native continuation markers", () => {
  test("marks and recognizes continuations through both APIs", () => {
    const value = { token: "later" };
    const marked = Effect.runSync(markNativeSuspensionEffect(value));
    expect(marked.value).toBe(value);
    expect(markNativeSuspension(value)).toBeInstanceOf(NativeSuspension);
    expect(Effect.runSync(isNativeSuspensionEffect(marked))).toBe(true);
    expect(isNativeSuspension(marked)).toBe(true);
    expect(isNativeSuspension({})).toBe(false);
  });

  test("finds a continuation in fail and die Causes", () => {
    const marked = new NativeSuspension("resume");
    const failed = Effect.runSyncExit(Effect.fail(marked));
    const died = Effect.runSyncExit(Effect.die(marked));
    expect(Exit.isFailure(failed)).toBe(true);
    expect(Exit.isFailure(died)).toBe(true);
    if (Exit.isFailure(failed) && Exit.isFailure(died)) {
      expect(Effect.runSync(findNativeSuspensionEffect(failed.cause))).toBe(marked);
      expect(findNativeSuspension(died.cause)).toBe(marked);
    }
    expect(findNativeSuspension(new Error("ordinary"))).toBeUndefined();
  });

  test("allows deterministic telemetry substitution", () => {
    const seen: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const marked = Effect.runSync(Effect.provide(markNativeSuspensionEffect(1), layer));
    Effect.runSync(Effect.provide(isNativeSuspensionEffect(marked), layer));
    Effect.runSync(Effect.provide(findNativeSuspensionEffect(marked), layer));
    expect(seen).toEqual(["suspension.mark", "suspension.is", "suspension.find"]);
  });
});
