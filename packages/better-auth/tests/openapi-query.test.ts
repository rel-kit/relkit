/** Checks that every native query contract is published, including wrapped and union schemas. */
import { expect, test } from "vitest";
import { betterAuth } from "better-auth";
import { getEndpoints } from "better-auth/api";
import { admin, magicLink, organization, username } from "better-auth/plugins";
import { generateBetterAuthOpenApi } from "../src/openapi.js";
import { documentQueryParameters } from "../src/openapi-query.js";

type Parameter = { name: string; in: string; required?: boolean; description?: string };
type Operation = { parameters?: Parameter[]; description?: string };

const auth = betterAuth({
  baseURL: "http://127.0.0.1:3000",
  secret: "test-only-openapi-schema-secret-12345",
  emailAndPassword: { enabled: true },
  plugins: [admin(), organization(), username(), magicLink({ sendMagicLink: async () => {} })],
});

test("publishes every query field and its required flag for core and plugin endpoints", async () => {
  const document = (await generateBetterAuthOpenApi(auth)) as {
    paths: Record<string, Record<string, Operation>>;
  };
  const context = await auth.$context;
  const gaps: string[] = [];
  for (const endpoint of Object.values(getEndpoints(context, context.options).api)) {
    const { path, options } = endpoint as {
      path?: string;
      options: { method: string | string[]; query?: any; metadata?: { SERVER_ONLY?: boolean } };
    };
    if (path === undefined || options.query === undefined || options.metadata?.SERVER_ONLY)
      continue;
    const schema = options.query["~standard"].jsonSchema.input({ target: "openapi-3.0" });
    const branches: { properties: object; required?: string[] }[] = schema.anyOf ?? [schema];
    const item = document.paths[`/api/auth${path.replace(/:([^/]+)/g, "{$1}")}`] ?? {};
    for (const method of [options.method].flat()) {
      const operation = item[method.toLowerCase()];
      if (operation === undefined) continue;
      const query = new Map(
        (operation.parameters ?? []).filter((p) => p.in === "query").map((p) => [p.name, p]),
      );
      for (const name of new Set(branches.flatMap((branch) => Object.keys(branch.properties)))) {
        const required = branches.every((branch) => branch.required?.includes(name));
        if (!query.has(name)) gaps.push(`${method} ${path}: ${name} undocumented`);
        else if (required && query.get(name)?.required !== true)
          gaps.push(`${method} ${path}: ${name} not marked required`);
      }
    }
  }
  expect(gaps).toEqual([]);
});

test("documents union branches and wrapped query objects", async () => {
  const document = (await generateBetterAuthOpenApi(auth)) as {
    paths: Record<string, Record<string, Operation>>;
  };
  const accountInfo = document.paths["/api/auth/account-info"]!.get!;
  expect(accountInfo.parameters?.map((p) => [p.name, p.required ?? false])).toEqual([
    ["accountId", false],
    ["userId", false],
    ["useAccountCookie", false],
  ]);
  expect(accountInfo.description).toContain(
    "Query accepts one of: accountId, userId? | useAccountCookie, userId?.",
  );
  const session = document.paths["/api/auth/get-session"]!.get!;
  expect(session.parameters?.map((p) => p.name)).toEqual(["disableCookieCache", "disableRefresh"]);
  const reset = document.paths["/api/auth/reset-password"]!.post!;
  expect(reset.parameters).toContainEqual(expect.objectContaining({ name: "token", in: "query" }));
});

test("keeps authored parameters, path parameters and non-standard schemas untouched", () => {
  const native = {
    paths: {
      "/items/{id}": {
        get: { parameters: [{ name: "id", in: "path", required: true }] },
      },
      "/authored": { get: { parameters: [{ name: "custom", in: "query" }] } },
    },
  };
  const projected = documentQueryParameters(native, [
    { path: "/items/:id", options: { method: "GET", query: {} } },
    {
      path: "/authored",
      options: {
        method: "GET",
        query: {
          "~standard": { jsonSchema: { input: () => ({ type: "object", properties: {} }) } },
        },
        metadata: { openapi: { parameters: [] } },
      },
    },
  ]);
  expect(projected).toEqual(native);
});

test("documents each endpoint's query only on its own method when endpoints share a path", () => {
  const query = (name: string) => ({
    "~standard": {
      jsonSchema: {
        input: () => ({ type: "object", properties: { [name]: { type: "string" } } }),
      },
    },
  });
  const projected = documentQueryParameters({ paths: { "/shared": { get: {}, post: {} } } }, [
    { path: "/shared", options: { method: "GET", query: query("id") } },
    { path: "/shared", options: { method: ["POST"], query: query("token") } },
  ]) as { paths: Record<string, Record<string, Operation>> };
  expect(projected.paths["/shared"]!.get!.parameters?.map((p) => p.name)).toEqual(["id"]);
  expect(projected.paths["/shared"]!.post!.parameters?.map((p) => p.name)).toEqual(["token"]);
});

test("fields of a query the endpoint accepts when omitted are not marked required", () => {
  const optionalQuery = {
    "~standard": {
      validate: (value: unknown) => (value === undefined ? { value } : { value }),
      jsonSchema: {
        input: () => ({
          type: "object",
          properties: { token: { type: "string" } },
          required: ["token"],
        }),
      },
    },
  };
  const projected = documentQueryParameters({ paths: { "/optional": { get: {} } } }, [
    { path: "/optional", options: { method: "GET", query: optionalQuery } },
  ]) as { paths: Record<string, Record<string, Operation>> };
  expect(projected.paths["/optional"]!.get!.parameters).toEqual([
    { name: "token", in: "query", schema: { type: "string" } },
  ]);
});
