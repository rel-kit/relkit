import { expect, it } from "@effect/vitest";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import {
  Context,
  Deferred,
  Effect,
  Layer,
  Logger,
  ManagedRuntime,
  Metric,
  References,
} from "effect";
import { authNativeAdapter } from "../../src/activation.js";
import { activateBetterAuthService, defineBetterAuthService } from "../../src/index.js";
import { AuthService, authNativeOf } from "../../src/auth.service.js";
import { authTestLayer, nativeAuthStub } from "./auth-test-layer.js";

const user = sqliteTable("user", { id: integer().primaryKey() });

it.effect(
  "Request abort reaches the SDK but Promise completion and DB close wait for native settlement",
  () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const events: string[] = [];
      const declaration = defineDrizzleService({
        schema: { user },
        client: () => ({}),
        dispose: () => {
          events.push("disposed");
        },
      });
      const database = yield* Effect.acquireRelease(
        Effect.promise(() => activateDrizzleService(declaration, {}, { isolated: true })),
        (active) => Effect.promise(() => active.close()),
      );
      let received: Request | undefined;
      const native = nativeAuthStub({
        handler: (request) => {
          received = request;
          Effect.runSync(Deferred.succeed(started, undefined));
          return Effect.runPromise(Deferred.await(finish)).then(() => {
            events.push("native settled");
            return new Response("ok");
          });
        },
      });
      const owner = yield* Effect.acquireRelease(
        Effect.sync(() =>
          ManagedRuntime.make(
            authTestLayer({ database, options: {}, basePath: "/api/auth" }, Effect.succeed(native)),
          ),
        ),
        (runtime) => Effect.promise(() => runtime.dispose()),
      );
      const service = yield* Effect.promise(() => owner.runPromise(AuthService));
      const auth = authNativeAdapter(owner, authNativeOf(service));
      const caller = new AbortController();
      const request = new Request("http://localhost/api/auth/get-session", {
        signal: caller.signal,
      });
      let completed = false;
      const result = auth.handler(request).then(
        () => {
          completed = true;
          return "success";
        },
        () => {
          completed = true;
          return "interrupted";
        },
      );
      yield* Deferred.await(started);
      caller.abort();
      expect(received).toBe(request);
      expect(received?.signal.aborted).toBe(true);
      const closing = database.close();
      expect(completed).toBe(false);
      expect(events).toEqual([]);
      yield* Deferred.succeed(finish, undefined);
      expect(yield* Effect.promise(() => result)).toBe("interrupted");
      yield* Effect.promise(() => closing);
      expect(events).toEqual(["native settled", "disposed"]);
    }).pipe(Effect.scoped),
);

it.effect(
  "native compatibility entrypoints inherit configured DB sinks during acquisition and calls",
  () =>
    Effect.gen(function* () {
      const entries: {
        readonly level: string;
        readonly annotations: Readonly<Record<string, unknown>>;
      }[] = [];
      const registry: Metric.MetricRegistry = new Map();
      const logger = Logger.make((options) => {
        entries.push({
          level: options.logLevel,
          annotations: options.fiber.getRef(References.CurrentLogAnnotations),
        });
      });
      const instrumentation = Context.make(Logger.CurrentLoggers, new Set([logger])).pipe(
        Context.add(References.MinimumLogLevel, "Info"),
        Context.add(Metric.MetricRegistry, registry),
      );
      const declaration = defineDrizzleService({ schema: { user }, client: () => ({}) });
      const database = yield* Effect.acquireRelease(
        Effect.promise(() =>
          activateDrizzleService(declaration, {}, { isolated: true, instrumentation }),
        ),
        (active) => Effect.promise(() => active.close()),
      );
      const descriptor = defineBetterAuthService({ baseURL: "http://localhost" });
      const auth = yield* Effect.promise(() =>
        activateBetterAuthService(descriptor, database, "/api/auth", { isolated: true }),
      );
      expect(yield* Effect.promise(() => auth.api.getSession({ headers: new Headers() }))).toBe(
        null,
      );
      yield* Effect.promise(() =>
        auth.handler(new Request("http://localhost/api/auth/get-session")),
      );
      const operations = entries.map((entry) => entry.annotations.operation);
      expect(operations.filter((operation) => operation === "auth.factory")).toHaveLength(1);
      expect(operations.filter((operation) => operation === "auth.acquire")).toHaveLength(1);
      expect(operations.filter((operation) => operation === "auth.session")).toHaveLength(1);
      expect(operations.filter((operation) => operation === "auth.handler")).toHaveLength(1);
      expect(entries.every((entry) => entry.level === "Info")).toBe(true);
      expect(
        [...registry.values()].some(
          (entry) =>
            entry.id === "relkit_execution_duration_ms" &&
            entry.attributes?.operation === "auth.session",
        ),
      ).toBe(true);
      const quiet = Context.make(Logger.CurrentLoggers, new Set([logger])).pipe(
        Context.add(References.MinimumLogLevel, "Error"),
      );
      const silentDb = yield* Effect.acquireRelease(
        Effect.promise(() =>
          activateDrizzleService(declaration, {}, { isolated: true, instrumentation: quiet }),
        ),
        (active) => Effect.promise(() => active.close()),
      );
      const count = entries.length;
      const silentAuth = yield* Effect.promise(() =>
        activateBetterAuthService(descriptor, silentDb, "/api/auth", { isolated: true }),
      );
      yield* Effect.promise(() => silentAuth.api.getSession({ headers: new Headers() }));
      expect(entries).toHaveLength(count);
    }).pipe(Effect.scoped),
);
