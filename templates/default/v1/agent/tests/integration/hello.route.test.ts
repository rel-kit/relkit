import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

const model = {
  resolveModel: (selector = "test:model") => ({ id: selector, model: {} }),
};
const testApp = await createTestApplication(config, {
  providers: { model: { openai: model, anthropic: model } },
});

test("GET /hello", async () => {
  const response = await testApp.http.request("/hello?name=Mustafa");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, Mustafa!" });
});

afterAll(() => testApp.close());
