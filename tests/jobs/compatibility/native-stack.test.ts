import { expect, test } from "bun:test";
import { dockerHostArguments, inngestReadinessHeaders } from "./native-stack.ts";

test("maps the Docker host on Linux runners", () => {
  expect(dockerHostArguments("linux")).toEqual(["--add-host", "host.docker.internal:host-gateway"]);
});

test("keeps Docker Desktop host resolution unchanged", () => {
  expect(dockerHostArguments("darwin")).toEqual([]);
});

test("builds the authenticated Inngest readiness request", () => {
  expect(inngestReadinessHeaders("a".repeat(64))).toMatchObject({
    authorization: expect.stringMatching(/^Bearer [0-9a-f]{64}$/),
  });
});
