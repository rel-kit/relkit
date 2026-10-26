/** Selected database application harness; database ownership remains scoped to each test. */
import { createTestApplication as createApplication } from "./application.js";
import { activateDrizzleTestServices } from "./application-drizzle-services.js";
import type { TestApplicationOptions, TestApplication } from "./application.types.js";
export type { TestApplicationOptions, TestApplication } from "./application.types.js";

/** Acquires the general harness with the explicit native database service installer. */
export function createTestApplication(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
): Promise<TestApplication> {
  return createApplication(app, {
    ...options,
    services: options.services ?? activateDrizzleTestServices,
  });
}
