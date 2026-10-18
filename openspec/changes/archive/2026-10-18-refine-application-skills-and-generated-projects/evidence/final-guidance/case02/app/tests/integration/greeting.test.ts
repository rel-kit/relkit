import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

test("greeting HTTP route maps the submitted name and rejects invalid names", async () => {
  const app = await createTestApplication(config, { projectRoot: resolve(import.meta.dir, "../.."), resourceProviders: "fake" });
  try {
    const response = await app.http.request("/hello?name=Ada");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Hello, Ada!" });
    const defaultName = await app.http.request("/hello");
    expect(defaultName.status).toBe(200);
    expect(await defaultName.json()).toEqual({ message: "Hello, world!" });
    for (const name of ["", "   ", "x".repeat(81)]) {
      const invalid = await app.http.request("/hello?name=" + encodeURIComponent(name));
      expect(invalid.status).toBe(422);
      await invalid.text();
    }
  } finally { await app.close(); }
}, 15_000);
