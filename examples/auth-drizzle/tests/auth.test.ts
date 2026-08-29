import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createTestApplication } from "@relkit/testing";
import config from "../relkit.config.js";

const application = await createTestApplication(config, {
  projectRoot: resolve(import.meta.dir, ".."),
});

test("Better Auth serves its filesystem-mounted API and creates cookie sessions", async () => {
  expect((await application.http.get("/account/profile")).status).toBe(401);
  const response = await application.http.post("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ name: "Demo", email: "demo@example.com", password: "password123" }),
  });
  expect(response.status).toBeLessThan(400);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toContain("better-auth");
  const profile = await application.http.get("/account/profile", {
    headers: { cookie: cookie ?? "" },
  });
  expect(profile.status).toBe(200);
  expect(await profile.json()).toMatchObject({ authenticated: true });
});

afterAll(() => application.close());
