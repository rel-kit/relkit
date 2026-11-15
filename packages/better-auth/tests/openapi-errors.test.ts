/**
 * The document declares the error body the endpoints send, lists Problem Details where RelKit
 * answers before the SDK runs, and lists only operations the instance serves. The error bodies
 * come from the real SDK router, as do the routing checks.
 */
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { describe, expect, test } from "vitest";
import type { JsonValue } from "relkit/contracts";
import { generateBetterAuthOpenApi } from "../src/openapi.js";
import { handleWithValidationDetail } from "../src/validation-detail.js";

type Json = { [key: string]: JsonValue };

const BASE = "http://127.0.0.1:3000";
const ERROR_REFERENCE = { $ref: "#/components/schemas/BetterAuthError" };
const METHODS = ["get", "post", "put", "patch", "delete"];

/** A real instance; `session` and `plugins` vary by test. */
function instance(options: { organizations?: boolean; sessionByPost?: boolean } = {}) {
  return betterAuth({
    baseURL: BASE,
    secret: "test-only-openapi-errors-secret-123456",
    emailAndPassword: { enabled: true },
    ...(options.sessionByPost === true ? { session: { deferSessionRefresh: true } } : {}),
    plugins: options.organizations === false ? [] : [organization()],
  });
}

/** Every operation of a document as method, mounted path and operation object. */
function operations(document: Json): { method: string; path: string; operation: Json }[] {
  return Object.entries(document.paths as Json).flatMap(([path, item]) =>
    Object.entries(item as Json)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, operation]) => ({ method, path, operation: operation as Json })),
  );
}

/** The content map of one response of an operation. */
function contentOf(document: Json, method: string, path: string, status: string): Json {
  const found = operations(document).find(
    (entry) => entry.method === method && entry.path === `/api/auth${path}`,
  );
  if (found === undefined) throw new Error(`missing ${method} ${path}`);
  return ((found.operation.responses as Json)[status] as Json).content as Json;
}

/** Sends one request to the instance the way the mounted service does. */
function send(auth: ReturnType<typeof instance>, method: string, path: string, body?: Json) {
  return handleWithValidationDetail(
    auth,
    new Request(`${BASE}/api/auth${path}`, {
      method: method.toUpperCase(),
      headers: {
        origin: BASE,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

describe("error responses", () => {
  test("every 4xx and 5xx JSON response refers to the shared error schema", async () => {
    const document = (await generateBetterAuthOpenApi(instance())) as Json;
    const inline = operations(document).flatMap(({ method, path, operation }) =>
      Object.entries(operation.responses as Json)
        .filter(([status]) => /^[45]\d\d$/.test(status))
        .filter(([, response]) => {
          const json = ((response as Json).content as Json | undefined)?.["application/json"];
          return (
            json !== undefined &&
            JSON.stringify((json as Json).schema) !== JSON.stringify(ERROR_REFERENCE)
          );
        })
        .map(([status]) => `${method} ${path} ${status}`),
    );
    expect(inline).toEqual([]);
    const component = ((document.components as Json).schemas as Json).BetterAuthError as Json;
    expect(component).toMatchObject({
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        code: { type: "string" },
        issues: { type: "array", items: { required: ["path", "message"] } },
      },
    });
    expect(component.description).toContain("no body");
  });

  test("the errors the endpoints send have the declared members", async () => {
    const auth = instance();
    const document = (await generateBetterAuthOpenApi(auth)) as Json;
    const component = ((document.components as Json).schemas as Json).BetterAuthError as Json;
    const declared = Object.keys(component.properties as Json);
    const answers = [
      { status: 401, response: await send(auth, "get", "/list-sessions") },
      { status: 400, response: await send(auth, "post", "/sign-in/email", {}) },
      { status: 401, response: await send(auth, "post", "/organization/set-active", {}) },
      { status: 405, response: await send(auth, "post", "/get-session", {}) },
    ];
    for (const { status, response } of answers) {
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as Json;
      expect(typeof body.message).toBe("string");
      expect(Object.keys(body).filter((key) => !declared.includes(key))).toEqual([]);
    }
    const invalid = (await (await send(auth, "post", "/sign-in/email", {})).json()) as Json;
    expect(invalid).toMatchObject({
      code: "VALIDATION_ERROR",
      issues: expect.arrayContaining([expect.objectContaining({ path: "body.email" })]),
    });
  });

  test("a state-changing operation's 403 also lists the transport policy's Problem", async () => {
    const document = (await generateBetterAuthOpenApi(instance())) as Json;
    expect(contentOf(document, "post", "/organization/set-active", "403")).toEqual({
      "application/json": { schema: ERROR_REFERENCE },
      "application/problem+json": { schema: { $ref: "#/components/schemas/BetterAuthProblem" } },
    });
    expect(Object.keys(contentOf(document, "get", "/list-sessions", "403"))).toEqual([
      "application/json",
    ]);
  });
});

describe("served operations", () => {
  test("POST get-session is listed only when the session may be refreshed by POST", async () => {
    const off = (await generateBetterAuthOpenApi(instance())) as Json;
    const on = (await generateBetterAuthOpenApi(instance({ sessionByPost: true }))) as Json;
    expect(Object.keys((off.paths as Json)["/api/auth/get-session"] as Json)).toEqual(["get"]);
    expect(Object.keys((on.paths as Json)["/api/auth/get-session"] as Json).sort()).toEqual([
      "get",
      "post",
    ]);
  });

  test.each([{ organizations: true }, { organizations: false }, { sessionByPost: true }])(
    "every documented operation is routed and can answer (%o)",
    async (options) => {
      const auth = instance(options);
      const document = (await generateBetterAuthOpenApi(auth)) as Json;
      const unserved: string[] = [];
      for (const { method, path } of operations(document)) {
        const response = await send(
          auth,
          method,
          path.slice("/api/auth".length).replace(/\{[^}]+\}/g, "probe"),
          method === "get" ? undefined : {},
        );
        // The SDK's router answers an unmatched method and path with an empty 404.
        const unrouted = response.status === 404 && (await response.text()) === "";
        if (unrouted || response.status === 405) unserved.push(`${method} ${path}`);
      }
      expect(unserved).toEqual([]);
      expect(operations(document).length).toBeGreaterThan(20);
    },
  );

  test("an instance without the organization plugin documents no organization operation", async () => {
    const document = (await generateBetterAuthOpenApi(instance({ organizations: false }))) as Json;
    expect(
      Object.keys(document.paths as Json).filter((path) => path.includes("/organization/")),
    ).toEqual([]);
    const withPlugin = (await generateBetterAuthOpenApi(instance())) as Json;
    expect(Object.keys(withPlugin.paths as Json)).toContain("/api/auth/organization/create");
  });
});
