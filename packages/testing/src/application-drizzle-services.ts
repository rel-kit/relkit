/** Selected database-only test acquisition; authentication SDKs are never imported. */
import { activateDrizzleService } from "@relkit/drizzle";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { nativeServiceError } from "./application-errors.js";
import { loadApplicationServices, soleNativeService } from "./application-service-discovery.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type {
  TestApplicationServices,
  TestServiceActivator,
  ServiceEnvironment,
} from "./application-services.types.js";

/** Database authority whose acquisition scope belongs to the application owner. */
class DrizzleTestServices extends Context.Service<
  DrizzleTestServices,
  Omit<TestApplicationServices, "close">
>()("relkit/testing/DrizzleServices") {}

/** Acquires the sole database and releases it exactly once with the returned owner. */
export const activateDrizzleTestServices: TestServiceActivator = async (root, env) => {
  const owner = ManagedRuntime.make(
    Layer.effect(DrizzleTestServices, acquire(root, env)).pipe(
      Layer.provideMerge(testingLoggerLayer()),
    ),
  );
  try {
    const services = await runExecutionPromise(owner, DrizzleTestServices);
    let closing: Promise<void> | undefined;
    return Object.freeze({ ...services, close: () => (closing ??= disposeTestingOwner(owner)) });
  } catch (error) {
    await disposeTestingOwner(owner);
    throw error;
  }
};

/** Acquires native work in the surrounding Layer's scope. */
function acquire(root: string, env: ServiceEnvironment) {
  return Effect.gen(function* () {
    const declarations = yield* loadApplicationServices(root);
    if (soleNativeService(declarations, "better-auth") !== undefined)
      return yield* Effect.fail(
        new Error("Authentication tests require @relkit/testing/better-auth"),
      );
    const declaration = soleNativeService(declarations, "drizzle");
    if (declaration === undefined) return { context: {} };
    const instrumentation = yield* Effect.context<never>();
    const database = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          activateDrizzleService(declaration as Parameters<typeof activateDrizzleService>[0], env, {
            isolated: true,
            instrumentation,
          }),
        catch: nativeServiceError,
      }),
      (active) => Effect.promise(() => active.close()),
    );
    return { context: { database: database.context } };
  });
}
