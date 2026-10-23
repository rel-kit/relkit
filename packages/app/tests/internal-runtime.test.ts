/** Verifies emitted hosts receive the exact helpers owned by the application's direct dependency. */
import { expect, it } from "vitest";
import {
  checkIntegrationDependencies,
  SelectedDependenciesLive,
  initializeIntegration,
} from "../src/internal-runtime.js";
import * as provider from "@relkit/provider/internal/dependencies";

it("preserves selected dependency helper identity through the app runtime facade", () => {
  expect(checkIntegrationDependencies).toBe(provider.checkIntegrationDependencies);
  expect(SelectedDependenciesLive).toBe(provider.SelectedDependenciesLive);
  expect(initializeIntegration).toBe(provider.initializeIntegration);
});
