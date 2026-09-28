import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineEvent } from "../src/index.js";

test("retains an explicit provider profile", () => {
  expect(
    defineEvent({ id: "orders.created", input: z.object({}), profile: "durable" }).profile,
  ).toBe("durable");
  expect(() =>
    defineEvent({ id: "orders.created", input: z.object({}), profile: "not valid" }),
  ).toThrow();
});
