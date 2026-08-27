import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import hello from "../../src/functions/hello.function.js";

test("hello returns a greeting", async () => {
  await expect(invokeFunction(hello, { name: "Mustafa" })).resolves.toEqual({
    message: "Hello, Mustafa!",
  });
});
