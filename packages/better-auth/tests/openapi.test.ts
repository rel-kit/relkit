/** Checks core/plugin projection through an actual native SDK and the shared OpenAPI compatibility boundary. */
import { expect, test } from "vitest";
import { projectAuthOpenApi } from "../src/openapi-projection.js";
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { generateBetterAuthOpenApi } from "../src/openapi.js";

test("projects core and plugin endpoints at a custom mount without exposing another reference", async () => {
  const auth = betterAuth({
    baseURL: "http://127.0.0.1:3000",
    basePath: "/account/auth",
    secret: "test-only-openapi-schema-secret-12345",
    emailAndPassword: { enabled: true },
    plugins: [username()],
  });
  const document = await generateBetterAuthOpenApi(auth);
  expect(document).toMatchObject({
    paths: {
      "/account/auth/sign-in/email": { post: { tags: ["Authentication"] } },
      "/account/auth/sign-in/username": {
        post: { tags: expect.arrayContaining(["Authentication"]) },
      },
    },
    components: { schemas: { BetterAuthUser: { type: "object" } } },
  });
  const serialized = JSON.stringify(document);
  expect(serialized).not.toContain('"$ref":"#/components/schemas/User"');
  expect(serialized).toContain("#/components/schemas/BetterAuthUser");
  expect(document).toHaveProperty("paths./account/auth/sign-in/email.post.security", []);
  expect(document).not.toHaveProperty("servers");
  expect(document).not.toHaveProperty("security");
  expect(
    (await auth.handler(new Request("http://127.0.0.1:3000/account/auth/open-api/generate-schema")))
      .status,
  ).toBe(404);
});

test("rewrites references without changing descriptions, examples or path metadata", () => {
  const reference = "#/components/schemas/User";
  const native = {
    paths: {
      "/sign-in": {
        summary: "Sign in",
        parameters: [{ name: "example", schema: { default: reference } }],
        post: { description: reference, responses: { "200": { schema: { $ref: reference } } } },
      },
    },
    components: {
      schemas: {
        User: {
          type: "object",
          description: reference,
          discriminator: { propertyName: "kind", mapping: { user: reference } },
        },
      },
    },
  };
  expect(projectAuthOpenApi(native)).toMatchObject({
    paths: {
      "/api/auth/sign-in": {
        summary: "Sign in",
        parameters: native.paths["/sign-in"].parameters,
        post: {
          description: reference,
          security: [],
          responses: {
            "200": { schema: { $ref: "#/components/schemas/BetterAuthUser" } },
          },
        },
      },
    },
    components: {
      schemas: {
        BetterAuthUser: {
          description: reference,
          discriminator: { mapping: { user: "#/components/schemas/BetterAuthUser" } },
        },
      },
    },
  });
  expect(native.paths["/sign-in"].post).not.toHaveProperty("security");
});

test("rejects invalid native metadata before publishing documentation", () => {
  expect(() => projectAuthOpenApi({ paths: null })).toThrow(TypeError);
  expect(() => projectAuthOpenApi({ paths: {}, invalid: new Date() })).toThrow();
});
