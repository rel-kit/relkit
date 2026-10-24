/** Verifies auth merging, application policy preservation and authorization-before-lookup at the real Hono request boundary. */
import { expect, test } from "vitest";
import { Hono } from "hono";
import type { RegistrationPlan } from "@relkit/graph";
import { mergeAuthDocument } from "../src/api-docs-auth.js";
import { OPENAPI_PATH, API_REFERENCE_PATH } from "../src/api-docs.js";
import { installScalarApiDocs as installApiDocs } from "../src/scalar.js";

const document = {
  openapi: "3.1.0",
  info: { title: "Todos", version: "1" },
  paths: { "/todos": { get: { responses: { "200": { description: "Todos" } } } } },
};
const plan: RegistrationPlan = {
  graphHash: "sha256:auth-docs",
  functions: [],
  httpTriggers: [],
  queues: [],
  schedules: [],
  eventTriggers: [],
  buckets: [],
  caches: [],
  tools: [],
  agents: [],
  channels: [],
  middlewares: [],
};
const authDocument = {
  paths: {
    "/api/auth/sign-in/email": {
      post: { tags: ["Authentication"], responses: { "200": { description: "Signed in" } } },
    },
  },
  components: { schemas: { BetterAuthUser: { type: "object" } } },
  tags: [{ name: "Authentication" }],
};

test("merges native authentication endpoints and schemas into the application document", async () => {
  const app = new Hono();
  installApiDocs(app, plan, {
    document,
    getAuthDocument: async () => authDocument,
  });
  const response = await app.request(OPENAPI_PATH);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    paths: { ...document.paths, ...authDocument.paths },
    components: authDocument.components,
    info: { description: expect.stringContaining("sign-in/email") },
  });
  expect(await (await app.request(API_REFERENCE_PATH)).text()).toContain("./openapi.json");
});

test("authorizes documentation before acquiring the native auth schema and embeds it", async () => {
  const app = new Hono();
  let calls = 0;
  installApiDocs(app, plan, {
    document,
    mode: "production",
    enabledInProduction: true,
    bearerToken: "docs-secret",
    getAuthDocument: async () => {
      calls++;
      return authDocument;
    },
  });
  expect((await app.request(OPENAPI_PATH)).status).toBe(401);
  expect((await app.request(API_REFERENCE_PATH)).status).toBe(401);
  expect(calls).toBe(0);
  const response = await app.request(API_REFERENCE_PATH, {
    headers: { authorization: "Bearer docs-secret" },
  });
  expect(await response.text()).toContain("/api/auth/sign-in/email");
  expect(calls).toBe(1);
});

test("preserves application servers, security and schemas and rejects conflicting paths", () => {
  const existing = {
    ...document,
    servers: [{ url: "/" }],
    security: [{ appKey: [] }],
    components: { schemas: { Todo: { type: "object" } } },
  };
  expect(mergeAuthDocument(existing, authDocument)).toMatchObject({
    servers: existing.servers,
    security: existing.security,
    components: { schemas: { ...existing.components.schemas, ...authDocument.components.schemas } },
  });
  expect(() => mergeAuthDocument(existing, { paths: { "/todos": {} } })).toThrow(
    "Duplicate authentication OpenAPI path",
  );
});
