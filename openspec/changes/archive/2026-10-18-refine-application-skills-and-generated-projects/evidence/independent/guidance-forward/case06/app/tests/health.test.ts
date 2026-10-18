import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import health from "../src/services/health/service.js";
import { GET } from "../src/routes/health/route.js";

test("health validates optional input and explicit output", async () => {
  expect(await invokeFunction(health.health, {})).toEqual({ status: "ok" });
  expect(await invokeFunction(health.health, { verbose: true })).toEqual({ status: "ok", detail: "Backend is ready" });
  await expect(invokeFunction(health.health, { verbose: "invalid" } as never)).rejects.toBeDefined();
  expect(GET.target).toBe(health.health);
});
