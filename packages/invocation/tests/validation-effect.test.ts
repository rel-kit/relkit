import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import { defaultRunner, unknownSchema, validateUnknownEffect } from "../src/validation-defaults.js";
import {
  InvocationIdGenerator,
  InvocationValidationError,
  InvocationPolicyFailure,
  SchemaValidationFailure,
  applicationFailure,
  assertInvocationMode,
  assertInvocationModeEffect,
  assertSource,
  assertSourceEffect,
  callHook,
  callHookEffect,
  nextInvocationIdEffect,
  makeInvocationValidationErrorEffect,
  validateDeclaredError,
  validateDeclaredErrorEffect,
  validated,
  validatedEffect,
} from "../src/index.js";

describe("Effect validation boundaries", () => {
  test("constructs a frozen public validation error through Effect", () => {
    const issue = { message: "required" };
    const failure = Effect.runSync(makeInvocationValidationErrorEffect("input", [issue]));
    expect(failure).toBeInstanceOf(InvocationValidationError);
    expect(failure.code).toBe("RELKIT_INPUT_VALIDATION");
    expect(Object.isFrozen(failure.issues)).toBe(true);
    expect(Object.isFrozen(failure.issues[0])).toBe(true);
  });
  test("runs default schema and runner through observed Effect paths", async () => {
    const value = { count: 1 };
    expect(Effect.runSync(validateUnknownEffect(value))).toEqual({ value });
    expect(unknownSchema["~standard"].validate(value)).toEqual({ value });
    await expect(defaultRunner.run(Effect.succeed(2))).resolves.toBe(2);
  });
  test("returns parsed values and tags validation failures", async () => {
    const schema = z.object({ count: z.number() });
    expect(await Effect.runPromise(validatedEffect(schema, { count: 2 }, "input"))).toEqual({
      count: 2,
    });
    const failure = await Effect.runPromise(
      Effect.catchTag(
        validatedEffect(schema, { count: "bad" }, "input"),
        "SchemaValidationFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(SchemaValidationFailure);
    expect(failure.cause).toMatchObject({ code: "RELKIT_INPUT_VALIDATION" });
    await expect(validated(schema, { count: "bad" }, "input")).rejects.toMatchObject({
      code: "RELKIT_INPUT_VALIDATION",
    });
  });

  test("tags a validator defect and preserves the public failure", async () => {
    const schema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => {
          throw new Error("schema broke");
        },
      },
    };
    const failure = await Effect.runPromise(
      Effect.catchTag(validatedEffect(schema, {}, "output"), "SchemaValidationFailure", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(failure).toMatchObject({ phase: "output", message: "Schema validator failed" });
    await expect(validated(schema, {}, "output")).rejects.toMatchObject({
      _tag: "UnexpectedDefect",
    });
  });

  test("absorbs hook failure without masking the result", async () => {
    const failed = async () => {
      throw new Error("observer broke");
    };
    await expect(Effect.runPromise(callHookEffect(failed, 1))).resolves.toBeUndefined();
    await expect(callHook(failed, 1)).resolves.toBeUndefined();
  });

  test("checks declared application error data", async () => {
    const error = applicationFailure({
      id: "errors.duplicate",
      message: "Duplicate",
      data: { key: 1 },
    });
    const definitions = [{ id: "errors.duplicate", data: z.object({ key: z.number() }) }];
    expect(await Effect.runPromise(validateDeclaredErrorEffect(definitions, error))).toBe(error);
    expect(await validateDeclaredError(definitions, error)).toBe(error);
    const invalid = await Effect.runPromise(validateDeclaredErrorEffect([], error));
    expect(invalid).toMatchObject({ _tag: "UnexpectedDefect" });
  });

  test("reports policy failures through tags and keeps TypeError adapters", () => {
    expect(Effect.runSync(assertSourceEffect("direct"))).toBeUndefined();
    const source = Effect.runSync(
      Effect.catchTag(assertSourceEffect("other"), "InvocationPolicyFailure", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(source).toBeInstanceOf(InvocationPolicyFailure);
    expect(() => assertSource("other")).toThrow(TypeError);
    const target = { id: "tasks.run", invocationMode: "event-only" as const };
    const mode = Effect.runSync(
      Effect.catchTag(
        assertInvocationModeEffect(target, "direct"),
        "InvocationPolicyFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(mode).toBeInstanceOf(InvocationPolicyFailure);
    expect(() => assertInvocationMode(target, "direct")).toThrow(TypeError);
  });

  test("substitutes the ID generator through a Layer", () => {
    const layer = Layer.succeed(InvocationIdGenerator, { next: () => "fixed-id" as never });
    expect(Effect.runSync(Effect.provide(nextInvocationIdEffect("invocation"), layer))).toBe(
      "fixed-id",
    );
  });
});
