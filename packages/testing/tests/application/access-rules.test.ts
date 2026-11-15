/** The in-process HTTP client decides a function's access rule as the served application does:
 * the caller is the request's Better Auth session, its roles and permissions come from the
 * organization plugin, and a rule with permissions is decided before input is validated.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineEnv } from "relkit/config";
import { createTestApplication, type TestApplication } from "../../src/better-auth.js";
import { store } from "../fixtures/access-auth-resource.js";

const resource = new URL("../fixtures/access-auth-resource.ts", import.meta.url).href;
let root: string;
let application: TestApplication;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-testing-access-"));
  const files = [
    ["src/auth/service.ts", `export { auth } from ${JSON.stringify(resource)};`],
    [
      "src/routes/vehicles/route.ts",
      `export { vehicleRoute as POST } from ${JSON.stringify(resource)};`,
    ],
  ] as const;
  for (const [file, source] of files) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), source);
  }
  application = await createTestApplication({ env: defineEnv({}) }, { projectRoot: root });
});

afterAll(async () => {
  await application?.close();
  await rm(root, { recursive: true, force: true });
});

/** Signs a user up through the application's own auth route.
 * @param email - New user's email.
 * @returns The session cookie and the user's id.
 */
async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
  const response = await application.http.post<{ user: { id: string } }>(
    "/api/auth/sign-up/email",
    { json: { email, password: "correct-horse-battery", name: email } },
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  return { cookie, userId: (await response.json()).user.id };
}

/** Calls the protected route.
 * @param body - JSON body.
 * @param cookie - Session cookie, if any.
 * @returns The response.
 */
function createVehicle(body: unknown, cookie?: string) {
  return application.http.post("/vehicles", {
    json: body,
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
}

test("anonymous callers are rejected with 401, before input is validated", async () => {
  const valid = await createVehicle({ plate: "AB-123" });
  expect(valid.status).toBe(401);
  expect(await valid.json()).toMatchObject({ code: "unauthenticated" });
  const invalid = await createVehicle({ plate: "" });
  expect(invalid.status).toBe(401);
  expect(await invalid.json()).not.toHaveProperty("issues");
});

test("organization roles decide: a driver gets 403, the owner succeeds", async () => {
  const owner = await signUp("owner@example.com");
  const created = await application.http.post<{ id: string }>("/api/auth/organization/create", {
    json: { name: "Fleet", slug: "fleet" },
    headers: { cookie: owner.cookie },
  });
  expect(created.status).toBe(200);
  const organizationId = (await created.json()).id;
  const driver = await signUp("driver@example.com");
  store.member!.push({
    id: "member-driver",
    organizationId,
    userId: driver.userId,
    role: "driver",
    createdAt: new Date(),
  });
  for (const caller of [owner, driver]) {
    const active = await application.http.post("/api/auth/organization/set-active", {
      json: { organizationId },
      headers: { cookie: caller.cookie },
    });
    expect(active.status).toBe(200);
  }

  const denied = await createVehicle({ plate: "AB-123" }, driver.cookie);
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({ code: "access-denied" });
  const deniedInvalid = await createVehicle({ plate: "" }, driver.cookie);
  expect(deniedInvalid.status).toBe(403);

  const allowed = await createVehicle({ plate: "AB-123" }, owner.cookie);
  expect(allowed.status).toBe(200);
  expect(await allowed.json()).toEqual({ plate: "AB-123" });
  const invalid = await createVehicle({ plate: "" }, owner.cookie);
  expect(invalid.status).toBe(422);
});
