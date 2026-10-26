/** General application acquisition never imports a native database or authentication SDK. */
import { Effect } from "effect";
import { loadApplicationServices, soleNativeService } from "./application-service-discovery.js";
import type { TestServiceActivator } from "./application-services.types.js";

/** Rejects an unselected native helper before returning an incomplete application. */
export const activateGenericTestServices: TestServiceActivator = async (root) => {
  const declarations = await Effect.runPromise(loadApplicationServices(root));
  if (
    soleNativeService(declarations, "drizzle") !== undefined ||
    soleNativeService(declarations, "better-auth") !== undefined
  ) {
    throw new Error(
      "Native test applications require @relkit/testing/drizzle or @relkit/testing/better-auth",
    );
  }
  return Object.freeze({ context: Object.freeze({}), close: async () => undefined });
};
