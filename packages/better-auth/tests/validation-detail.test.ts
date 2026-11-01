/** Checks that native validation failures name every failing field through the real SDK router. */
import { expect, test } from "vitest";
import { betterAuth } from "better-auth";
import { handleWithValidationDetail } from "../src/validation-detail.js";

const auth = betterAuth({
  baseURL: "http://127.0.0.1:3000",
  secret: "test-only-validation-detail-secret-1234",
  emailAndPassword: { enabled: true },
});

test("explains which fields each accepted query shape is missing", async () => {
  const response = await handleWithValidationDetail(
    auth,
    new Request("http://127.0.0.1:3000/api/auth/account-info"),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    code: "VALIDATION_ERROR",
    message:
      "[query] Must match one of 2 shapes: (accountId: required, expected string) or (useAccountCookie: required, expected true)",
    issues: [
      { path: "query.accountId", message: "required, expected string", option: 1 },
      { path: "query.useAccountCookie", message: "required, expected true", option: 2 },
    ],
  });
});

test("names a field combined from another accepted shape", async () => {
  const response = await handleWithValidationDetail(
    auth,
    new Request(
      "http://127.0.0.1:3000/api/auth/account-info?accountId=a&userId=u&useAccountCookie=true",
    ),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    code: "VALIDATION_ERROR",
    message:
      "[query.useAccountCookie] Cannot be combined with the other fields sent; send one of: accountId, userId? | useAccountCookie, userId?",
    issues: [
      {
        path: "query.useAccountCookie",
        message:
          "Cannot be combined with the other fields sent; send one of: accountId, userId? | useAccountCookie, userId?",
      },
    ],
  });
});

test("shows the received value when a query string cannot match a non-string field", async () => {
  const response = await handleWithValidationDetail(
    auth,
    new Request("http://127.0.0.1:3000/api/auth/account-info?useAccountCookie=true"),
  );
  expect(((await response.json()) as { message: string }).message).toBe(
    '[query] Must match one of 2 shapes: (accountId: required, expected string, useAccountCookie: not accepted in this shape) or (useAccountCookie: expected true, received the text "true")',
  );
});

test("adds field issues to body failures and leaves other responses untouched", async () => {
  const invalid = await handleWithValidationDetail(
    auth,
    new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({ email: "not-an-email" }),
    }),
  );
  expect(invalid.status).toBe(400);
  const body = (await invalid.json()) as { code: string; issues: unknown[] };
  expect(body.code).toBe("VALIDATION_ERROR");
  expect(body.issues).toEqual([{ path: "body.password", message: "required, expected string" }]);

  const ok = await handleWithValidationDetail(
    auth,
    new Request("http://127.0.0.1:3000/api/auth/ok"),
  );
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true });
});
