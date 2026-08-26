import { expect, test } from "bun:test";
import { BETTER_AUTH_HANDLER, betterAuthAdapter } from "./src/index.ts";

test("brands one immutable Better Auth raw handler and validates protection patterns", async () => {
  const auth = {
    handler: async () => new Response("auth"),
    api: { getSession: async () => ({ user: { id: "user-1" } }) },
  };
  const handler = betterAuthAdapter(auth, { protected: ["/orders/*", "/mcp", "/orders/*"] });
  expect(handler[BETTER_AUTH_HANDLER]).toMatchObject({
    kind: "better-auth",
    auth,
    protected: ["/mcp", "/orders/*"],
  });
  expect(await (await handler(new Request("http://localhost/api/auth"))).text()).toBe("auth");
  expect(Object.isFrozen(handler)).toBe(true);
  expect(() => betterAuthAdapter(auth, { protected: ["orders"] })).toThrow(
    "Invalid protected route pattern",
  );
});
