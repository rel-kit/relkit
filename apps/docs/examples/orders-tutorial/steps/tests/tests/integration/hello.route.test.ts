import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

const testApp = await createTestApplication(config, {
  env: { BETTER_AUTH_SECRET: "isolated-test-secret-never-use-in-production-12345" },
});

test("GET /hello", async () => {
  const response = await testApp.http.get("/hello?name=Mustafa");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, Mustafa!" });
});

afterAll(() => testApp.close());
