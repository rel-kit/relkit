import { expect, test } from "bun:test";
import { auth } from "@app/auth.js";
import { initializeAuthDatabase } from "@app/data/auth.data-model.js";

test("Better Auth serves its filesystem-mounted API and creates cookie sessions", async () => {
  initializeAuthDatabase();
  const response = await auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ name: "Demo", email: "demo@example.com", password: "password123" }),
    }),
  );
  expect(response.status).toBeLessThan(400);
  expect(response.headers.get("set-cookie")).toContain("better-auth");
});
