import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@zsys/testing";
import config from "../../zsys.config.js";

const testApp = await createTestApplication(config);

test("GET /hello", async () => {
  const response = await testApp.http.request("/hello?name=Mustafa");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, Mustafa!" });
});

afterAll(() => testApp.close());
