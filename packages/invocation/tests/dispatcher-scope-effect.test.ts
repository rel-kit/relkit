import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  InvocationScopeStorage,
  currentExecutionContext,
  currentExecutionContextEffect,
  currentInvocationScope,
  currentInvocationScopeEffect,
  currentTaskAncestry,
  currentTaskAncestryEffect,
  runDetachedExecution,
  runDetachedExecutionEffect,
  runInExecutionContextEffect,
  runInInvocationScopeEffect,
  runInTaskAncestryEffect,
  runInTaskAncestry,
} from "../src/index.js";
import type { InvocationDispatchScope } from "../src/index.js";

describe("Effect invocation scopes", () => {
  test("retains scope across an asynchronous callback and detaches on request", async () => {
    const ancestry = { runId: "run-1", taskId: "task-1" };
    const result = Effect.runSync(
      runInInvocationScopeEffect({ taskAncestry: ancestry }, async () => {
        await Promise.resolve();
        expect(currentTaskAncestry()).toEqual(ancestry);
        expect(currentInvocationScope()?.taskAncestry).toEqual(ancestry);
        return runDetachedExecution(() => currentTaskAncestry());
      }),
    );
    expect(await result).toBeUndefined();
    expect(currentInvocationScope()).toBeUndefined();
  });

  test("exposes current, ancestry, execution, and detached Effect operations", () => {
    const ancestry = { runId: "run-1", taskId: "task-1" };
    const context = { span: {} as never, runtime: {} as never };
    const program = Effect.gen(function* () {
      expect(yield* currentInvocationScopeEffect()).toBeUndefined();
      expect(yield* currentExecutionContextEffect()).toBeUndefined();
      expect(yield* currentTaskAncestryEffect()).toBeUndefined();
      expect(yield* runInTaskAncestryEffect(ancestry, () => currentTaskAncestry())).toEqual(
        ancestry,
      );
      expect(yield* runInExecutionContextEffect(context, () => currentExecutionContext())).toEqual(
        context,
      );
      return yield* runDetachedExecutionEffect(() => currentExecutionContext());
    });
    expect(Effect.runSync(program)).toBeUndefined();
    expect(runInTaskAncestry(ancestry, () => currentTaskAncestry())).toEqual(ancestry);
  });

  test("substitutes the scope carrier with a deterministic Layer", () => {
    const seen: InvocationDispatchScope[] = [];
    const initial: InvocationDispatchScope = { taskAncestry: { runId: "run", taskId: "task" } };
    const layer = Layer.succeed(InvocationScopeStorage, {
      current: () => initial,
      run: <A>(scope: InvocationDispatchScope, callback: () => A): A => {
        seen.push(scope);
        return callback();
      },
    });
    const program = Effect.gen(function* () {
      expect(yield* currentInvocationScopeEffect()).toBe(initial);
      return yield* runInInvocationScopeEffect({}, () => "done");
    });
    expect(Effect.runSync(Effect.provide(program, layer))).toBe("done");
    expect(seen).toEqual([{}]);
  });
});
