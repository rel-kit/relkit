import { feature } from "./documentation-catalog.js";

export const testingFeature = feature(
  "testing",
  "Testing",
  "Exercise the engine with HTTP helpers and deterministic fakes.",
  "operations/testing",
  "testing",
  [
    ["packages/testing/src/invoke-function.ts", "invokeFunction"],
    ["packages/testing/src/application.ts", "createTestApplication"],
  ],
  ["templates/default/v1/api/tests/integration/orders.route.test.ts"],
);
