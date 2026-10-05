import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Tracer } from "effect";
import { AuthFailure } from "../../src/auth.errors.js";
import { makeAuthFactory } from "../../src/auth.factory.js";
import { AuthService } from "../../src/auth.service.js";
import { authTestDatabase, authTestLayer, nativeAuthStub } from "./auth-test-layer.js";

it.effect(
  "configured tracers redact named Auth spans without changing native values or causes",
  () =>
    Effect.gen(function* () {
      const database = yield* authTestDatabase();
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const secret = "auth-native-secret-cookie-password-token";
      const failure = new Error(secret);
      let failHandler = false;
      const native = nativeAuthStub({
        handler: async () => {
          if (failHandler) throw failure;
          return new Response(secret);
        },
        session: async () => {
          throw failure;
        },
      });
      yield* Effect.gen(function* () {
        const service = yield* AuthService;
        const response = yield* service.handler(
          new Request("http://localhost/api/auth/get-session"),
        );
        expect(yield* Effect.promise(() => response.text())).toBe(secret);
        failHandler = true;
        const handlerExit = yield* Effect.exit(
          service.handler(new Request("http://localhost/api/auth/get-session")),
        );
        const apiExit = yield* Effect.exit(service.api("getSession", []));
        for (const exit of [handlerExit, apiExit]) {
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const reason = Cause.squash(exit.cause);
            expect(reason).toBeInstanceOf(AuthFailure);
            expect((reason as AuthFailure).cause).toBe(failure);
          }
        }
      }).pipe(
        Effect.provide(
          authTestLayer(
            { database, options: { secret }, basePath: "/api/auth" },
            Effect.succeed(native),
          ),
        ),
        Effect.provideService(Tracer.Tracer, tracer),
      );
      const failedFactory = makeAuthFactory(() =>
        Effect.fail(new AuthFailure({ operation: "auth.factory", cause: failure })),
      );
      const defectFactory = makeAuthFactory(() => Effect.die(failure));
      const factoryFailure = yield* Effect.exit(failedFactory.create({ secret })).pipe(
        Effect.provideService(Tracer.Tracer, tracer),
      );
      const factoryDefect = yield* Effect.exit(defectFactory.create({ secret })).pipe(
        Effect.provideService(Tracer.Tracer, tracer),
      );
      expect(
        Exit.isFailure(factoryFailure) && (Cause.squash(factoryFailure.cause) as AuthFailure).cause,
      ).toBe(failure);
      expect(Exit.isFailure(factoryDefect) && Cause.squash(factoryDefect.cause)).toBe(failure);
      const diagnostics: unknown[] = [];
      const successes: unknown[] = [];
      for (const span of spans) {
        if (span.status._tag !== "Ended") continue;
        if (Exit.isSuccess(span.status.exit)) successes.push(span.status.exit.value);
        else
          diagnostics.push(
            Cause.prettyErrors(span.status.exit.cause, { includeCauseInStack: true }).map(
              (error) => ({ message: error.message, stack: error.stack }),
            ),
          );
      }
      expect(spans.map((span) => span.name)).toEqual(
        expect.arrayContaining([
          "AuthFactory.create",
          "AuthService.handler",
          "AuthService.api",
          "relkit.auth.factory",
          "relkit.auth.acquire",
        ]),
      );
      expect(JSON.stringify(diagnostics)).not.toContain(secret);
      expect(successes.every((value) => value === undefined)).toBe(true);
    }).pipe(Effect.scoped),
);
