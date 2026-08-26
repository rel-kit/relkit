import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@zsys/testing";
import config from "../../zsys.config.js";

const testApp = await createTestApplication(config);

test("POST /echo", async () => {
  const response = await testApp.http.request("/echo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "hello" });
});

afterAll(() => testApp.close());
