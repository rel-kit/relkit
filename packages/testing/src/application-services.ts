import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { activateBetterAuthService } from "@relkit/better-auth";
import { activateDrizzleService } from "@relkit/drizzle";
import { createHttpAuthRuntime } from "@relkit/runtime-hono";
import type { TestRawRoute, TestRoute } from "./application-routes.js";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { observeExecution, runExecutionPromise } from "@relkit/contracts/operation";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type {
  ApplicationServicesPlatform,
  TestApplicationServices,
} from "./application-services.types.js";
export type {
  ApplicationServicesPlatform,
  TestApplicationServices,
} from "./application-services.types.js";

/** Native service activation dependencies, acquired once per application owner. */
export class TestServicesPlatform extends Context.Service<
  TestServicesPlatform,
  ApplicationServicesPlatform
>()("relkit/testing/ServicesPlatform") {}

/** Database and authentication context whose lifetime follows its Layer. */
export class TestServices extends Context.Service<
  TestServices,
  Omit<TestApplicationServices, "close">
>()("relkit/testing/Services") {}

export const TestServicesPlatformLive = Layer.succeed(
  TestServicesPlatform,
  TestServicesPlatform.of({
    load: loadServices,
    database: (service, env) => activateDrizzleService(service, env, { isolated: true }),
    auth: (service, database, basePath) =>
      activateBetterAuthService(service, database, basePath, { isolated: true }),
  }),
);

/**
 * Acquires database/auth services with reverse-order release on startup failure.
 * @param root Source project root.
 * @param env Already validated environment values.
 * @param routes Routes containing the optional auth mount.
 * @returns Context and an idempotent shutdown hook.
 */
export async function activateTestServices(
  root: string,
  env: Readonly<Record<string, unknown>>,
  routes: readonly TestRoute[],
): Promise<TestApplicationServices> {
  const owner = ManagedRuntime.make(
    testServicesLayer(root, env, routes).pipe(
      Layer.provide(TestServicesPlatformLive),
      Layer.provideMerge(testingLoggerLayer()),
    ),
  );
  try {
    const services = await runExecutionPromise(owner, TestServices);
    let closing: Promise<void> | undefined;
    return Object.freeze({ ...services, close: () => (closing ??= disposeTestingOwner(owner)) });
  } catch (error) {
    await disposeTestingOwner(owner);
    throw error;
  }
}

/**
 * Defines the service workflow independently of native activation implementations.
 * @param root Source project root to load.
 * @param env Resolved environment shared with the database.
 * @param routes Declared HTTP routes used to identify auth's base path.
 * @returns A scoped service Layer requiring TestServicesPlatform.
 */
export function testServicesLayer(
  root: string,
  env: Readonly<Record<string, unknown>>,
  routes: readonly TestRoute[],
) {
  return Layer.effect(
    TestServices,
    observeExecution(
      "testing",
      "services.acquire",
      Effect.fn("Testing.services.acquire")(function* () {
        const platform = yield* TestServicesPlatform;
        const services = yield* Effect.tryPromise({
          try: () => platform.load(root),
          catch: (cause) => cause,
        });
        const databaseService = soleCapability(services, "drizzle");
        const authService = soleCapability(services, "better-auth");
        const database =
          databaseService === undefined
            ? undefined
            : yield* Effect.acquireRelease(
                Effect.tryPromise({
                  try: () =>
                    platform.database(
                      databaseService as unknown as Parameters<
                        ApplicationServicesPlatform["database"]
                      >[0],
                      env,
                    ),
                  catch: (cause) => cause,
                }),
                (value) => Effect.promise(() => value.close()),
              );
        const mount = routes.find(isAuthMount);
        if (authService !== undefined && (database === undefined || mount === undefined)) {
          return yield* Effect.fail(
            new Error("Better Auth tests require one Drizzle service and one auth ALL route"),
          );
        }
        const activeAuth =
          authService === undefined
            ? undefined
            : yield* Effect.tryPromise({
                try: () =>
                  platform.auth(
                    authService as unknown as Parameters<ApplicationServicesPlatform["auth"]>[0],
                    database!,
                    basePath(mount!),
                  ),
                catch: (cause) => cause,
              });
        const auth =
          activeAuth === undefined || mount === undefined
            ? undefined
            : createHttpAuthRuntime({
                protected: mount.auth?.protected ?? [],
                publicPaths: [basePath(mount), mount.path],
                getSession: async (headers) =>
                  (await activeAuth.api.getSession({ headers })) ?? null,
              });
        return TestServices.of(
          Object.freeze({
            context: Object.freeze({
              ...(database === undefined ? {} : { database: database.context }),
            }),
            ...(auth === undefined ? {} : { auth }),
            ...(activeAuth === undefined
              ? {}
              : { authHandler: (request: Request) => activeAuth.handler(request) }),
          }),
        );
      })(),
    ),
  );
}

/**
 * Loads declared source services in deterministic file order.
 * @param root - Explicit source project or persistence root.
 * @returns Service descriptors without activating their native resources.
 */
async function loadServices(root: string): Promise<readonly Record<string, unknown>[]> {
  const source = join(root, "src");
  const files = [...new Bun.Glob("*/service.ts").scanSync({ cwd: source, onlyFiles: true })];
  const services: Record<string, unknown>[] = [];
  for (const file of files.sort()) {
    const module = (await import(pathToFileURL(join(source, file)).href)) as Record<
      string,
      unknown
    >;
    for (const value of Object.values(module)) {
      if (isRecord(value) && value.kind === "service") services.push(value);
    }
  }
  return services;
}

/**
 * Selects the sole declared service for a native capability.
 * @param services - Loaded service descriptors before native activation.
 * @param kind - Required native service capability.
 * @returns The matching descriptor or undefined; ambiguity throws.
 */
function soleCapability(
  services: readonly Record<string, unknown>[],
  kind: "drizzle" | "better-auth",
): Record<string, unknown> | undefined {
  const matches = services.filter(
    (service) => isRecord(service.capability) && service.capability.kind === kind,
  );
  if (matches.length > 1) throw new Error(`Test application has multiple ${kind} services`);
  return matches[0];
}

/**
 * Checks the ALL route authority used for native authentication.
 * @param route - Authored route descriptor with parsed native metadata.
 * @returns True for a raw ALL route with authentication registration.
 */
function isAuthMount(route: TestRoute): route is TestRawRoute {
  return route.method === "ALL" && "handler" in route && route.auth !== undefined;
}

/**
 * Derives the native authentication base from its filesystem catch-all mount.
 * @param route - Authored route descriptor with parsed native metadata.
 * @returns The mount path without its terminal wildcard segment.
 */
function basePath(route: TestRawRoute): string {
  return route.path.replace(/\/\*[^/]+\??$/, "");
}

/**
 * Checks the shallow non-array object shape before selective property access.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True for a non-null non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
