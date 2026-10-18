/** Checks hello.function through the supported public RELKIT APIs. */
import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import hello from "@app/services/hello/functions/hello.function.js";

test("hello returns a greeting", async () => {
  await expect(invokeFunction(hello, { name: "Mustafa" })).resolves.toEqual({
    message: "Hello, Mustafa!",
  });
});
