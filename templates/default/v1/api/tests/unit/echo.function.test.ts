import { expect, test } from "bun:test";
import { invokeFunction } from "@zsys/testing";
import echo from "../../src/functions/echo.function.js";

test("echo returns its input", async () => {
  await expect(invokeFunction(echo, { message: "hello" })).resolves.toEqual({
    message: "hello",
  });
});
