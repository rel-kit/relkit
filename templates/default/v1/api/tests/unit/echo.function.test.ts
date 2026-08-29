import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import echo from "@app/echo/functions/echo.function.js";

test("echo returns its input", async () => {
  await expect(invokeFunction(echo, { message: "hello" })).resolves.toEqual({
    message: "hello",
  });
});
