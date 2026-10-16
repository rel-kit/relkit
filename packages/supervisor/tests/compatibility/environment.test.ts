/** Explicit removals must not reintroduce startup dotenv values in a candidate. */
import { expect, test } from "bun:test";
import { childEnvironment } from "../../src/candidate-process.js";

test("explicit removals drop inherited values while supervisor identity remains authoritative", () => {
  const environment = childEnvironment(
    { PATH: undefined, PORT: "incorrect", RELKIT_SOURCE_TOKEN: "incorrect" },
    { sourceToken: 7, generationToken: 9 },
    12345,
  );
  expect(environment.PATH).toBeUndefined();
  expect(environment.PORT).toBe("12345");
  expect(environment.RELKIT_SOURCE_TOKEN).toBe("7");
});
