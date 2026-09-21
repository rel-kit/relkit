import { expect, test } from "bun:test";
import { dockerHostArguments } from "./native-stack.ts";

test("maps the Docker host on Linux runners", () => {
  expect(dockerHostArguments("linux")).toEqual(["--add-host", "host.docker.internal:host-gateway"]);
});

test("keeps Docker Desktop host resolution unchanged", () => {
  expect(dockerHostArguments("darwin")).toEqual([]);
});
