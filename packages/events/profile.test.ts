import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import { defineEvent } from "./src/index.ts";

test("retains an explicit provider profile", () => {
  expect(
    defineEvent({ id: "orders.created", input: z.object({}), profile: "durable" }).profile,
  ).toBe("durable");
  expect(() =>
    defineEvent({ id: "orders.created", input: z.object({}), profile: "not valid" }),
  ).toThrow();
});
