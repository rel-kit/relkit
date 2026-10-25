/** Keeps the starter's Hello HTTP coverage after the application selects a native Drizzle service. */
import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing/drizzle";
import config from "../../relkit.config.js";

const testApp = await createTestApplication(config);

test("GET /hello", async () => {
  const response = await testApp.http.get("/hello?name=Mustafa");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, Mustafa!" });
});

afterAll(() => testApp.close());
