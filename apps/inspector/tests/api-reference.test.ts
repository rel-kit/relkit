/** Verifies the inspector reference works independently of optional backend UI routes. */
import { expect, test } from "bun:test";
import { SCALAR_API_REFERENCE_URL } from "../lib/api-reference";

test("Scalar links point to an inspector-owned page", () => {
  expect(SCALAR_API_REFERENCE_URL).toBe("/scalar");
});
