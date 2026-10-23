/** Native application service ownership and replaceable activation dependencies. */
import type { HttpAuthRuntime } from "@relkit/runtime-hono";
import type { TestRoute } from "./application-routes.js";
import type { TestRuntime, TestRuntimeOptions } from "./runtime.types.js";

/** Uses the existing generic runtime's environment contract without an SDK dependency. */
export type ServiceEnvironment = TestRuntime["env"];

/** Acquired owner-specific authorities; auth borrows the sole database. */
export interface TestApplicationServices {
  readonly context: NonNullable<TestRuntimeOptions["context"]>;
  readonly auth?: HttpAuthRuntime;
  readonly authHandler?: (request: Request) => Promise<Response>;
  readonly close: () => Promise<void>;
}

/** Explicit capability helper selected before application acquisition. */
export type TestServiceActivator = (
  root: string,
  env: ServiceEnvironment,
  routes: readonly TestRoute[],
) => Promise<TestApplicationServices>;
