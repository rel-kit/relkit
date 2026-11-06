/** Checks the outcome implied by an error status that no thrown failure classified. */
import { expect, test } from "vitest";
import { responseOutcome } from "../../src/runtime-hono/response-outcome.js";

test("classifies unthrown error statuses and keeps recorded failures", () => {
  expect(responseOutcome("success", 200)).toBe("success");
  expect(responseOutcome("success", 304)).toBe("success");
  expect(responseOutcome("success", 400)).toBe("validation-error");
  expect(responseOutcome("success", 422)).toBe("validation-error");
  expect(responseOutcome("success", 401)).toBe("declared-error");
  expect(responseOutcome("success", 404)).toBe("declared-error");
  expect(responseOutcome("success", 500)).toBe("defect");
  expect(responseOutcome("declared-error", 400)).toBe("declared-error");
  expect(responseOutcome("cancelled", 200)).toBe("cancelled");
});
