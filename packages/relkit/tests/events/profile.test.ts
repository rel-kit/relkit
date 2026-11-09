import { expect, test } from "vitest";
import { z } from "../../src/schema/index.js";
import { defineEvent } from "../../src/events/index.js";

test("retains an explicit provider profile", () => {
  expect(
    defineEvent({ id: "orders.created", input: z.object({}), profile: "durable" }).profile,
  ).toBe("durable");
  expect(() =>
    defineEvent({ id: "orders.created", input: z.object({}), profile: "not valid" }),
  ).toThrow();
});
