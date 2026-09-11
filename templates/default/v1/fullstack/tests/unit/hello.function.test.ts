import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import hello from "@app/hello/functions/hello.function.js";

test("greets by name", async () => {
  await expect(invokeFunction(hello, { name: "Ada" })).resolves.toEqual({ message: "Hello, Ada!" });
});
