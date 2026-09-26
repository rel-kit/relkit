import { describe, expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit } from "effect";
import { defineError, defineErrorEffect, isErrorDescriptor } from "../src/define-error.js";
import { createFunctionDescriptor } from "../src/function-descriptor-factory.js";
import {
  copyDependencies,
  copyPublishes,
  validateLimit,
} from "../src/define-function-validation.js";
import { FunctionOperationError } from "../src/function-observability.js";
import { streamOf } from "../src/stream.js";

const input = z.object({ id: z.string() });
const output = z.object({ id: z.string() });
const handler = ({ id }: { id: string }) => ({ id });
const definition = () => ({
  id: "orders.lookup",
  input,
  output,
  handler,
  invocationMode: "callable" as const,
});

describe("declared errors", () => {
  test("preserves validated data, metadata, and construction", () => {
    const NotFound = defineError({
      id: "orders.not-found",
      data: input,
      message: ({ id }) => `Missing ${id}`,
      http: { status: 404 },
      retry: "never",
    });
    const failure = NotFound.create({ id: "one" });
    expect(failure).toMatchObject({
      id: "orders.not-found",
      message: "Missing one",
      data: { id: "one" },
      http: { status: 404 },
    });
    expect(Object.isFrozen(failure.data)).toBe(true);
    expect(isErrorDescriptor(NotFound)).toBe(true);
    expect(isErrorDescriptor({ ...NotFound, retry: "invalid" })).toBe(false);
    expect(() => NotFound.create({ id: 1 } as never)).toThrow("Invalid data");
  });

  test("keeps definition failures typed in Effect", async () => {
    const exit = await Effect.runPromiseExit(
      defineErrorEffect({
        id: "orders.bad",
        data: input,
        message: "Missing",
        http: { status: 42 },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(Cause.squash(exit.cause)).toBeInstanceOf(FunctionOperationError);
    const retryExit = await Effect.runPromiseExit(
      defineErrorEffect({
        id: "orders.bad",
        data: input,
        message: "Missing",
        retry: "soon" as never,
      }),
    );
    expect(Exit.isFailure(retryExit)).toBe(true);
    if (Exit.isFailure(retryExit)) {
      const failure = Cause.squash(retryExit.cause);
      expect(failure).toBeInstanceOf(FunctionOperationError);
      expect((failure as FunctionOperationError).reason).toContain("Declared error retry");
    }
    expect(() =>
      defineError({ id: "orders.bad", data: input, message: "Missing", http: { status: 42 } }),
    ).toThrow("Error HTTP status must be an integer from 100 through 599");
    expect(() =>
      defineError({ id: "orders.bad", data: null as never, message: "Missing" }),
    ).toThrow("Declared error data must be a Standard Schema v1 validator");
    expect(() => defineError({ id: "orders.bad", data: input, message: 1 as never })).toThrow(
      "Error message must be a string or function",
    );
  });
});

describe("function definition validation", () => {
  test("rejects malformed schemas, handlers, hooks, and limits", () => {
    expect(() => createFunctionDescriptor({ ...definition(), input: null as never })).toThrow(
      "input must be a Standard Schema",
    );
    expect(() => createFunctionDescriptor({ ...definition(), output: null as never })).toThrow(
      "output must be a Standard Schema",
    );
    expect(() => createFunctionDescriptor({ ...definition(), progress: null as never })).toThrow(
      "progress must be a Standard Schema",
    );
    expect(() => createFunctionDescriptor({ ...definition(), handler: 1 as never })).toThrow(
      "Function handler must be a function",
    );
    expect(() => createFunctionDescriptor({ ...definition(), onBefore: 1 as never })).toThrow(
      "Function onBefore must be a function",
    );
    expect(() => createFunctionDescriptor({ ...definition(), timeoutMs: 0 })).toThrow(
      "timeoutMs must be a positive integer",
    );
    expect(() => createFunctionDescriptor({ ...definition(), concurrency: 1.5 })).toThrow(
      "concurrency must be a positive integer",
    );
    expect(() => validateLimit(undefined, "timeoutMs")).not.toThrow();
  });

  test("rejects tool metadata on event and stream definitions", () => {
    const tool = { description: "Lookup", sideEffect: "read" as const, approval: "never" as const };
    expect(() =>
      createFunctionDescriptor({ ...definition(), invocationMode: "event-only", tool }),
    ).toThrow("Event functions cannot declare tool metadata");
    expect(() =>
      createFunctionDescriptor({ ...definition(), output: streamOf(z.string()), tool }),
    ).toThrow("Stream-output functions cannot declare tool metadata");
  });

  test("copies valid dependency and publish lists, and rejects bad entries", () => {
    expect(copyDependencies(undefined)).toBeUndefined();
    expect(copyPublishes([" orders.created "])).toEqual(["orders.created"]);
    expect(() => copyPublishes(["orders.created", "orders.created"])).toThrow("must be unique");
    expect(() => copyPublishes([""])).toThrow("non-empty event IDs");
    expect(() => copyDependencies({ functions: {} } as never)).toThrow(
      "Function dependencies are not supported",
    );
    expect(() => copyDependencies({ events: {} } as never)).toThrow(
      "Event dependencies are not supported",
    );
    expect(() => copyDependencies({ buckets: 1 } as never)).toThrow("must be an object");
    expect(() => copyDependencies({ buckets: { uploads: {} } } as never)).toThrow(
      "Invalid buckets dependency",
    );
  });
});
