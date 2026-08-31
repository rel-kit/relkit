import { expect, test } from "bun:test";
import hello from "@app/hello/functions/hello.function.js";
import lookup from "../fixtures/lookup.tool.js";
import { mcpDisabled, privateLookup } from "../fixtures/mcp-options.js";

test("defineTool reuses the greeting function", async () => {
  expect(lookup.target.ref).toEqual(hello.ref);
  expect(lookup.mcp).toBe(true);
  await expect(lookup.invoke({ name: "Ada" })).resolves.toEqual({
    message: "Hello, Ada!",
  });
});

test("MCP visibility can be disabled without disabling ordinary tool invocation", async () => {
  expect(privateLookup.mcp).toBe(false);
  expect(mcpDisabled.server?.mcp).toBe(false);
  await expect(privateLookup.invoke({ name: "Ada" })).resolves.toEqual({
    message: "Hello, Ada!",
  });
});
