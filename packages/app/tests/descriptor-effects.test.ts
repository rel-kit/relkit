import { defineEnv } from "@relkit/config";
import { IdentityStore } from "@relkit/invocation";
import { Effect, Layer, Result } from "effect";
import { expect, test } from "vitest";
import {
  ContextDescriptorFailure,
  defineConstants,
  defineConstantsEffect,
  definePrompt,
  definePromptEffect,
} from "../src/context-descriptors.js";
import { AppValidationFailure } from "../src/app-validation.js";
import { copyEffect, normalizeDefaultsEffect } from "../src/app-provider-normalization.js";
import { defineApp, defineAppEffect } from "../src/define-app.js";

test("defines frozen constants and prompts directly in Effect", () => {
  const constants = Effect.runSync(
    defineConstantsEffect({ tags: ["one", { nested: true }] }, { id: "a.constants" }),
  );
  const prompt = Effect.runSync(
    definePromptEffect(["Be concise.", "Use tools."], { id: "a.prompt" }),
  );
  expect(constants.id).toBe("a.constants");
  expect(prompt.value).toEqual(["Be concise.", "Use tools."]);
  expect(Object.isFrozen(constants.values.tags)).toBe(true);
  expect(Object.isFrozen(prompt.value)).toBe(true);
  expect(defineConstants({ ok: true }).kind).toBe("constants");
  expect(definePrompt("Help").value).toBe("Help");
});

test("substitutes the identity source through an Effect Layer", () => {
  let next = 0;
  const identity = Layer.succeed(
    IdentityStore,
    IdentityStore.of({
      canonical: new WeakMap(),
      unbound: new WeakMap(),
      services: new WeakMap(),
      nextUnboundId: () => `test-${++next}`,
    }),
  );
  const program = Effect.gen(function* () {
    const app = yield* defineAppEffect({ env: defineEnv({}) });
    const constants = yield* defineConstantsEffect({ region: "eu" });
    const prompt = yield* definePromptEffect("Help");
    return [app.id, constants.id, prompt.id];
  });
  expect(Effect.runSync(Effect.provide(program, identity))).toEqual([
    "unbound.test-1",
    "unbound.test-2",
    "unbound.test-3",
  ]);
});

test("maps identity source failures into the application and context error channels", () => {
  const sourceError = new TypeError("id source down");
  const identity = Layer.succeed(
    IdentityStore,
    IdentityStore.of({
      canonical: new WeakMap(),
      unbound: new WeakMap(),
      services: new WeakMap(),
      nextUnboundId: () => {
        throw sourceError;
      },
    }),
  );
  const app = Effect.runSync(
    Effect.result(Effect.provide(defineAppEffect({ env: defineEnv({}) }), identity)),
  );
  const constants = Effect.runSync(
    Effect.result(Effect.provide(defineConstantsEffect({ ok: true }), identity)),
  );
  expect(Result.isFailure(app)).toBe(true);
  if (Result.isFailure(app)) expect(app.failure.cause).toBe(sourceError);
  expect(Result.isFailure(constants)).toBe(true);
  if (Result.isFailure(constants)) expect(constants.failure.cause).toBe(sourceError);
});

test("returns typed descriptor failures and preserves synchronous messages", () => {
  const invalid = Effect.runSync(
    Effect.result(defineConstantsEffect({ bad: Number.POSITIVE_INFINITY } as never)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(ContextDescriptorFailure);
    expect(invalid.failure.message).toContain('Constant "bad" is invalid');
  }
  expect(() => defineConstants({ bad: Number.POSITIVE_INFINITY } as never)).toThrow(
    'Constant "bad" is invalid',
  );
  expect(() => defineConstants([] as never)).toThrow("Constants must be an object map");
  expect(() => defineConstants({ ok: true }, null as never)).toThrow("options must be an object");
  expect(() => defineConstants({ ok: true }, { id: 1 } as never)).toThrowError(
    "Invalid stable ID: expected a string",
  );
  expect(() => defineConstants({ "": true })).toThrow('Constant "" is invalid');
  expect(() => defineConstants({ nested: [1, Symbol("bad")] } as never)).toThrow("is invalid");
  expect(() => defineConstants({ nested: { bad: undefined } } as never)).toThrow("is invalid");
  expect(() => definePrompt("")).toThrow("nonempty text");
  expect(() => definePrompt(["yes", " "])).toThrow("nonempty text");
  expect(() => definePrompt("yes", null as never)).toThrow("options must be an object");
  expect(() => definePrompt("yes", { id: 1 } as never)).toThrowError(
    "Invalid stable ID: expected a string",
  );
  const promptFailure = Effect.runSync(Effect.result(definePromptEffect([])));
  expect(Result.isFailure(promptFailure)).toBe(true);
  if (Result.isFailure(promptFailure))
    expect(promptFailure.failure._tag).toBe("ContextDescriptorFailure");
  let enumerations = 0;
  const malformed = new Proxy(
    {},
    {
      ownKeys: () => {
        if (++enumerations === 2) throw "spread failed";
        return [];
      },
    },
  );
  const thrown = Effect.runSync(Effect.result(defineConstantsEffect(malformed)));
  expect(Result.isFailure(thrown)).toBe(true);
  if (Result.isFailure(thrown)) expect(thrown.failure.message).toBe("spread failed");
});

test("defines an application in Effect with typed failures", () => {
  const env = defineEnv({});
  const app = Effect.runSync(
    defineAppEffect({ env, server: { port: 3000 }, compatibility: { legacyJobs: true } }),
  );
  expect(app.server?.port).toBe(3000);
  expect(app.compatibility.legacyJobs).toBe(true);
  const invalid = Effect.runSync(
    Effect.result(defineAppEffect({ env, unexpected: true } as never)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(AppValidationFailure);
  expect(() => defineApp({ env, unexpected: true } as never)).toThrow(
    'Unknown defineApp option "unexpected"',
  );
  expect(() => defineApp({ env: {} } as never)).toThrow("requires an environment definition");
  const poisoned = Object.defineProperty({ env }, "title", {
    enumerable: true,
    get: () => {
      throw "bad metadata";
    },
  });
  const thrown = Effect.runSync(Effect.result(defineAppEffect(poisoned as never)));
  expect(Result.isFailure(thrown)).toBe(true);
  if (Result.isFailure(thrown)) expect(thrown.failure.message).toBe("bad metadata");
  expect(() => defineApp({ env, jobs: {} as never, job: {} as never })).toThrow(
    "cannot specify both",
  );
  expect(() => defineApp({ env, defaults: { unexpected: "x" } as never })).toThrow(
    "Unknown default capability",
  );
  expect(() => defineApp({ env, compatibility: { legacyJobs: "yes" } as never })).toThrow(
    "must be a boolean",
  );
});

test("provider normalization keeps expected failures typed", () => {
  const invalidDefault = Effect.runSync(
    Effect.result(normalizeDefaultsEffect({}, { jobs: "missing" } as never)),
  );
  expect(Result.isFailure(invalidDefault)).toBe(true);
  if (Result.isFailure(invalidDefault))
    expect(invalidDefault.failure.message).toContain("defaults.job");
  const invalidCopy = Effect.runSync(Effect.result(copyEffect(1n)));
  expect(Result.isFailure(invalidCopy)).toBe(true);
  if (Result.isFailure(invalidCopy))
    expect(invalidCopy.failure).toBeInstanceOf(AppValidationFailure);
  const throwing = new Proxy(
    {},
    {
      ownKeys: () => {
        throw "copy failed";
      },
    },
  );
  const thrownString = Effect.runSync(Effect.result(copyEffect(throwing)));
  expect(Result.isFailure(thrownString)).toBe(true);
  if (Result.isFailure(thrownString)) expect(thrownString.failure.message).toBe("copy failed");
});
