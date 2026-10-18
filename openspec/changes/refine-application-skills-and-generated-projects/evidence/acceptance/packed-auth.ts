/** Exercises native cookies and a deliberately protected resource through actual production HTTP. */
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { repository } from "./packed-support.ts";

export async function protect(root: string) {
  // The test runtime deliberately accepts only explicit env; native CLI env alone is insufficient.
  const testPath = join(root, "tests/integration/hello.route.test.ts");
  const testSource = await readFile(testPath, "utf8");
  await writeFile(testPath, testSource.replace(
    '{ resourceProviders: "fake" }',
    '{ resourceProviders: "fake", env: { DATABASE_PATH: process.env.DATABASE_PATH, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL } }',
  ));
  for (const path of [
    "src/services/account/service.ts",
    "src/services/account/functions/session.function.ts",
    "src/routes/account/profile/route.ts",
    "src/routes/api/auth/[[...auth]]/route.ts",
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(repository, "examples/auth-drizzle", path), join(root, path));
  }
  const source = await readFile(join(root, "src/services/database/schema/index.ts"), "utf8");
  assert.ok(source.includes("items") && (source.includes("auth") || source.includes('sqliteTable("session"')));
  await writeFile(
    join(root, "acceptance-protection.txt"),
    "Explicit test-owned protected resource; original auth protocol preserved.\n",
  );
}

export async function authHttp(base: string) {
  const credentials = {
    name: "Acceptance",
    email: "acceptance@example.com",
    password: "acceptance-password-123",
  };
  const headers = { "content-type": "application/json", origin: base };
  const request = async (path: string, options: RequestInit = {}) =>
    fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
  const denied = await request("/account/profile");
  assert.equal(denied.status, 401);
  await denied.arrayBuffer();
  const signup = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers,
    body: JSON.stringify(credentials),
  });
  const signupBody = await signup.json();
  assert.equal(signup.status, 200, JSON.stringify(signupBody));
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.includes("better-auth"));
  const allowed = await request("/account/profile", { headers: { cookie } });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).authenticated, true);
  const session = await request("/api/auth/get-session", { headers: { cookie } });
  assert.equal((await session.json()).user.email, credentials.email);
  const signout = await request("/api/auth/sign-out", {
    method: "POST",
    headers: { ...headers, cookie },
    body: "{}",
  });
  assert.equal(signout.status, 200);
  await signout.arrayBuffer();
  const revoked = await request("/account/profile", { headers: { cookie } });
  assert.equal(revoked.status, 401);
  await revoked.arrayBuffer();
  for (const password of ["wrong-password", credentials.password]) {
    const response = await request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: credentials.email, password }),
    });
    assert.equal(response.status, password === credentials.password ? 200 : 401);
    await response.arrayBuffer();
    if (password === credentials.password) {
      const signedIn = response.headers.get("set-cookie")?.split(";", 1)[0];
      assert.ok(signedIn?.includes("better-auth"));
      const profile = await request("/account/profile", { headers: { cookie: signedIn } });
      assert.equal(profile.status, 200);
      await profile.arrayBuffer();
    }
  }
  return { signup: true, signin: true, sessionCookie: true, deniedAllowed: true, revocation: true };
}
