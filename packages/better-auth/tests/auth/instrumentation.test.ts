import { expect, it } from "@effect/vitest";
import { Context, Effect, Exit, Logger, Metric, References } from "effect";
import { AuthService } from "../../src/auth.service.js";
import { authTestDatabase, authTestLayer, nativeAuthStub } from "./auth-test-layer.js";

it.effect(
  "records standalone success/failure at configured levels with bounded redacted diagnostics",
  () =>
    Effect.gen(function* () {
      const database = yield* authTestDatabase();
      const logs: unknown[] = [];
      const registry: Metric.MetricRegistry = new Map();
      const logger = Logger.make((options) => {
        logs.push({
          message: options.message,
          level: options.logLevel,
          annotations: options.fiber.getRef(References.CurrentLogAnnotations),
        });
      });
      const native = nativeAuthStub({
        session: async () => {
          throw new Error("secret cookie=private token=private");
        },
      });
      yield* Effect.gen(function* () {
        const service = yield* AuthService;
        yield* service.handler(
          new Request("http://localhost/api/auth/get-session", {
            headers: { Authorization: "Bearer private" },
          }),
        );
        const exit = yield* Effect.exit(
          service.api("getSession", [{ headers: new Headers({ Cookie: "private" }) }]),
        );
        expect(Exit.isFailure(exit)).toBe(true);
      }).pipe(
        Effect.provide(
          authTestLayer({ database, options: {}, basePath: "/api/auth" }, Effect.succeed(native)),
        ),
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(Metric.MetricRegistry, registry),
        Effect.provideService(References.MinimumLogLevel, "Info"),
      );
      expect(logs).toHaveLength(4);
      expect(JSON.stringify(logs)).not.toContain("private");
      const outcomes = [...registry.values()].filter(
        (entry) => entry.id === "relkit_execution_outcomes_total",
      );
      expect(
        outcomes.some(
          (entry) =>
            entry.attributes?.operation === "auth.handler" &&
            entry.attributes?.outcome === "success",
        ),
      ).toBe(true);
      expect(
        outcomes.some(
          (entry) =>
            entry.attributes?.operation === "auth.session" &&
            entry.attributes?.outcome === "failure",
        ),
      ).toBe(true);
      expect(outcomes.every((entry) => entry.hooks.get(Context.empty()).count === 1)).toBe(true);
    }).pipe(Effect.scoped),
);
