/** Explicit database-backed authentication test application facade. */
import { createTestApplication as createApplication } from "./application.js";
import { activateTestServices } from "./application-services.js";
import type { TestApplicationOptions, TestApplication } from "./application.types.js";
export type { TestApplicationOptions, TestApplication } from "./application.types.js";

/** Acquires auth over a borrowed database while preserving general harness ownership. */
export function createTestApplication(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
): Promise<TestApplication> {
  return createApplication(app, { ...options, services: options.services ?? activateTestServices });
}
