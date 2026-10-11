/**
 * Exercises lazy native generation, typed failure identity and configured logs
 * through AuthOpenApi's real Layer. The fake SDK context uses the same constructor
 * seam as live generation; no database or global logging mutation is required.
 */
import { expect, it } from "@effect/vitest";
import { betterAuth } from "better-auth";
import { Effect, Layer, Logger } from "effect";
import { AuthOpenApi, generateBetterAuthOpenApi } from "../src/openapi.js";

it.effect("acquisition is lazy and generation failures remain typed with their native cause", () =>
  Effect.gen(function* () {
    const failure = new Error("private SDK failure");
    let calls = 0;
    const auth = {
      get $context() {
        calls += 1;
        throw failure;
      },
    };
    const layer = Layer.effect(AuthOpenApi, AuthOpenApi.make(auth));
    yield* Effect.gen(function* () {
      const service = yield* AuthOpenApi;
      expect(calls).toBe(0);
      const error = yield* Effect.flip(service.generate());
      expect(error._tag).toBe("AuthFailure");
      expect(error.operation).toBe("auth.openapi");
      expect(error.cause).toBe(failure);
      expect(calls).toBe(1);
    }).pipe(Effect.provide(layer));
  }),
);

it.effect("the Promise adapter retains failures and the application's configured log sink", () =>
  Effect.gen(function* () {
    const messages: string[] = [];
    const sink = Logger.make((options) => {
      messages.push(JSON.stringify(options.message));
    });
    yield* Effect.gen(function* () {
      const context = yield* Effect.context<never>();
      const auth = betterAuth({
        baseURL: "http://localhost",
        secret: "test-openapi-secret-123456789012345",
      });
      const document = yield* Effect.promise(() => generateBetterAuthOpenApi(auth, context));
      expect(document).toHaveProperty("paths");
      expect(messages.some((message) => message.includes("Execution operation completed"))).toBe(
        true,
      );
      const failure = new Error("private native failure");
      const failedAuth = {
        get $context() {
          throw failure;
        },
      };
      const rejected = yield* Effect.tryPromise({
        try: () => generateBetterAuthOpenApi(failedAuth, context),
        catch: (cause) => cause,
      }).pipe(Effect.flip);
      expect(rejected).toBe(failure);
      expect(messages.some((message) => message.includes("Execution operation failed"))).toBe(true);
      expect(messages.join()).not.toContain("private native failure");
    }).pipe(Effect.provide(Logger.layer([sink])));
  }),
);
