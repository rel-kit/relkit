import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

const testApp = await createTestApplication(config, {
  env: { BETTER_AUTH_SECRET: "isolated-test-secret-never-use-in-production-12345" },
});

test("POST /echo", async () => {
  const response = await testApp.http.post("/echo", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "hello" });
});

afterAll(() => testApp.close());
