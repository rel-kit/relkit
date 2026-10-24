/** Owns scoped database/auth activation for a test application in either service layout. */
import { activateBetterAuthService } from "@relkit/better-auth/drizzle";
import { activateDrizzleService } from "@relkit/drizzle";
import { observeExecution, runExecutionPromise } from "@relkit/contracts/operation";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import type { TestRoute } from "./application-routes.js";
import { acquireApplicationAuth, nativeServiceError } from "./application-service-auth.js";
import { loadApplicationServices, soleNativeService } from "./application-service-discovery.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type {
  ApplicationServicesPlatform,
  NativeDatabase,
  DatabaseDeclaration,
  AuthDeclaration,
} from "./application-native-services.types.js";
import type { ServiceEnvironment, TestApplicationServices } from "./application-services.types.js";
export type { ApplicationServicesPlatform } from "./application-native-services.types.js";
export type { TestApplicationServices } from "./application-services.types.js";

/** Native activation dependencies acquired once per application owner. */
export class TestServicesPlatform extends Context.Service<
  TestServicesPlatform,
  ApplicationServicesPlatform
>()("relkit/testing/ServicesPlatform", {
  /** Provides the native adapters; construction itself acquires no resources. */
  make: Effect.sync(
    () =>
      ({
        load: loadApplicationServices,
        database: (service, env, options) =>
          activateDrizzleService(service, env, { ...options, isolated: true }),
        auth: (service, database, basePath) =>
          activateBetterAuthService(service, database, basePath, { isolated: true }),
      }) satisfies ApplicationServicesPlatform,
  ),
}) {}

/** Database and authentication authorities whose lifetime follows their Layer. */
export class TestServices extends Context.Service<
  TestServices,
  Omit<TestApplicationServices, "close">
>()("relkit/testing/Services", {
  /**
   * Acquires services with reverse-order release, including partial-startup failure.
   * @param root - Authored project root.
   * @param env - Already validated environment values.
   * @param routes - Authored HTTP routes.
   * @returns Scoped authorities requiring the replaceable native platform.
   */
  make: Effect.fn("Testing.services.acquire")(
    function* (root: string, env: ServiceEnvironment, routes: readonly TestRoute[]) {
      const platform = yield* TestServicesPlatform;
      const instrumentation = yield* Effect.context<never>();
      const services = yield* platform.load(root);
      const declaration = soleNativeService(services, "drizzle") as DatabaseDeclaration | undefined;
      let database: NativeDatabase | undefined;
      if (declaration !== undefined)
        database = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => platform.database(declaration, env, { instrumentation }),
            catch: nativeServiceError,
          }),
          (active) => Effect.promise(() => active.close()),
        );
      const auth = yield* acquireApplicationAuth(
        platform,
        soleNativeService(services, "better-auth") as AuthDeclaration | undefined,
        database,
        routes,
      );
      return Object.freeze({
        context: Object.freeze(database === undefined ? {} : { database: database.context }),
        ...auth,
      });
    },
    (effect) => observeExecution("testing", "services.acquire", effect),
  ),
}) {}

/** Live native adapters; no database or auth client is acquired by this Layer. */
export const TestServicesPlatformLive = Layer.effect(
  TestServicesPlatform,
  TestServicesPlatform.make,
);

/**
 * Builds an owner-scoped Layer over replaceable native dependencies.
 * @param root - Authored project root.
 * @param env - Validated environment.
 * @param routes - Routes including the optional auth mount.
 * @returns A Layer requiring TestServicesPlatform.
 */
export function testServicesLayer(
  root: string,
  env: ServiceEnvironment,
  routes: readonly TestRoute[],
) {
  return Layer.effect(TestServices, TestServices.make(root, env, routes));
}

/**
 * Acquires services with an idempotent native shutdown hook.
 * @param root - Source project root.
 * @param env - Validated environment.
 * @param routes - Authored HTTP routes.
 * @returns Context and a hook that waits for every finalizer.
 */
export async function activateTestServices(
  root: string,
  env: ServiceEnvironment,
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
