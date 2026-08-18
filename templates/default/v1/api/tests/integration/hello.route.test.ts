import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@zsys/testing";
import app from "../../src/app.js";

const testApp = await createTestApplication(app);

test("GET /hello", async () => {
  const response = await testApp.http.request("/hello?name=Mustafa");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, Mustafa!" });
});

afterAll(() => testApp.close());
