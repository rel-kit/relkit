/**
 * The projected document is true to what the endpoints send: OpenAPI 3.1 nullability, the success
 * answers the SDK's generator describes wrongly or not at all, and the answers every operation
 * with a body can give beyond the SDK's own list. The expectations come from the SDK's source.
 */
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { describe, expect, test } from "vitest";
import type { JsonValue } from "relkit/contracts";
import { nullableToType } from "../src/openapi-nullable.js";
import { correctAuthResponses } from "../src/openapi-responses.js";
import { generateBetterAuthOpenApi } from "../src/openapi.js";

type Json = { [key: string]: JsonValue };

/** The document of an instance with email sign-up and the organization plugin. */
async function documentWithOrganizations(): Promise<Json> {
  const auth = betterAuth({
    baseURL: "http://127.0.0.1:3000",
    secret: "test-only-openapi-contract-secret-12345",
    emailAndPassword: { enabled: true },
    plugins: [organization()],
  });
  return (await generateBetterAuthOpenApi(auth)) as Json;
}

/** One operation of the document, by method and mounted path. */
function operation(document: Json, method: string, path: string): Json {
  const found = ((document.paths as Json)[`/api/auth${path}`] as Json | undefined)?.[method];
  if (found === undefined) throw new Error(`missing ${method} ${path}`);
  return found as Json;
}

/** The JSON schema of an operation's response. */
function schemaOf(document: Json, method: string, path: string, status: string): Json {
  const responses = operation(document, method, path).responses as Json;
  return ((((responses[status] as Json).content as Json)["application/json"] as Json).schema ??
    {}) as Json;
}

describe("a document from a real instance", () => {
  test("uses OpenAPI 3.1 nullability: a new user's image may be null", async () => {
    const document = await documentWithOrganizations();
    expect(JSON.stringify(document)).not.toContain('"nullable"');
    const user = (schemaOf(document, "post", "/sign-up/email", "200").properties as Json)
      .user as Json;
    expect((user.properties as Json).image).toMatchObject({ type: ["string", "null"] });
    const component = ((document.components as Json).schemas as Json).BetterAuthUser as Json;
    expect((component.properties as Json).image).toEqual({ type: ["string", "null"] });
  });

  test("describes the answers the SDK's generator got wrong or left out", async () => {
    const document = await documentWithOrganizations();
    expect(schemaOf(document, "post", "/organization/delete", "200")).toEqual({
      $ref: "#/components/schemas/BetterAuthOrganization",
    });
    expect(
      (schemaOf(document, "post", "/organization/has-permission", "200").properties as Json).error,
    ).toEqual({ type: ["string", "null"] });
    expect(schemaOf(document, "post", "/organization/check-slug", "200")).toMatchObject({
      required: ["status"],
    });
    expect(schemaOf(document, "get", "/organization/list-invitations", "200")).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/BetterAuthInvitation" },
    });
    expect(schemaOf(document, "get", "/organization/list-members", "200")).toMatchObject({
      required: ["members", "total"],
    });
  });

  test("an operation with a body also declares 413 and 415, one without does not", async () => {
    const document = await documentWithOrganizations();
    const signIn = operation(document, "post", "/sign-in/email").responses as Json;
    expect(signIn["415"]).toMatchObject({ content: { "application/json": {} } });
    expect(signIn["413"]).toMatchObject({
      content: {
        "application/problem+json": { schema: { $ref: "#/components/schemas/BetterAuthProblem" } },
      },
    });
    const session = operation(document, "get", "/get-session").responses as Json;
    expect(session).not.toHaveProperty("413");
    expect(session).not.toHaveProperty("415");
    expect(((document.components as Json).schemas as Json).BetterAuthProblem).toMatchObject({
      required: ["type", "title", "status", "code", "detail"],
    });
  });

  test("every reference resolves to a component", async () => {
    const document = await documentWithOrganizations();
    const schemas = (document.components as Json).schemas as Json;
    const missing = [
      ...JSON.stringify(document).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g),
    ]
      .map((match) => match[1] ?? "")
      .filter((name) => !(name in schemas));
    expect(missing).toEqual([]);
  });
});

describe("nullableToType", () => {
  test("converts the 3.0 keyword by the schema's shape", () => {
    expect(nullableToType({ type: "string", nullable: true })).toEqual({
      type: ["string", "null"],
    });
    expect(nullableToType({ type: ["string", "integer"], nullable: true })).toEqual({
      type: ["string", "integer", "null"],
    });
    expect(nullableToType({ type: ["string", "null"], nullable: true })).toEqual({
      type: ["string", "null"],
    });
    expect(nullableToType({ $ref: "#/components/schemas/A", nullable: true })).toEqual({
      anyOf: [{ $ref: "#/components/schemas/A" }, { type: "null" }],
    });
    expect(nullableToType({ type: "string", enum: ["a"], nullable: true })).toEqual({
      type: ["string", "null"],
      enum: ["a", null],
    });
    expect(nullableToType({ enum: ["a", null], nullable: true })).toEqual({ enum: ["a", null] });
    expect(nullableToType({ description: "any", nullable: true })).toEqual({ description: "any" });
    expect(nullableToType({ type: "string", nullable: false })).toEqual({ type: "string" });
  });

  test("walks nested schemas and arrays but leaves examples and defaults alone", () => {
    const value = {
      oneOf: [{ type: "integer", nullable: true }],
      properties: { nullable: { type: "boolean" } },
      example: { nullable: true },
      default: { nullable: true },
    };
    expect(nullableToType(value)).toEqual({
      oneOf: [{ type: ["integer", "null"] }],
      properties: { nullable: { type: "boolean" } },
      example: { nullable: true },
      default: { nullable: true },
    });
    expect(nullableToType("text")).toBe("text");
    expect(nullableToType(null)).toBe(null);
  });
});

describe("correctAuthResponses", () => {
  const ok = { description: "ok", content: { "application/json": { schema: { type: "object" } } } };
  const mounted = (path: string, method: string, value: Json): Json => ({
    paths: { [`/api/auth${path}`]: { [method]: { responses: { "200": ok }, ...value } } },
  });

  test("leaves a form the SDK already has right, and non-operations, alone", () => {
    const rightDelete = mounted("/organization/delete", "post", {
      responses: {
        "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/x" } } } },
      },
    });
    const document = {
      ...rightDelete,
      paths: {
        ...(rightDelete.paths as Json),
        "/api/auth/other": { summary: "no operation", get: "not an operation" },
      },
    };
    const corrected = correctAuthResponses(document, "/api/auth");
    expect(corrected.paths).toEqual(document.paths);
  });

  test("a has-permission answer that is not the known wrong form is untouched", () => {
    for (const responses of [
      {},
      { "200": ok },
      {
        "200": {
          description: "ok",
          content: {
            "application/json": { schema: { properties: { error: { type: ["string", "null"] } } } },
          },
        },
      },
    ]) {
      const document = mounted("/organization/has-permission", "post", { responses });
      const corrected = correctAuthResponses(document, "/api/auth");
      expect(
        (((corrected.paths as Json)["/api/auth/organization/has-permission"] as Json).post as Json)
          .responses,
      ).toEqual(responses);
    }
  });

  test("a body operation keeps the 413 and 415 it already declares", () => {
    const own = { description: "own" };
    const document = mounted("/x", "post", {
      requestBody: { content: {} },
      responses: { "413": own, "415": own },
    });
    const responses = (
      ((correctAuthResponses(document, "/api/auth").paths as Json)["/api/auth/x"] as Json)
        .post as Json
    ).responses;
    expect(responses).toEqual({ "413": own, "415": own });
  });

  test("components without a user schema gain only the Problem schema", () => {
    const corrected = correctAuthResponses({ paths: {} }, "/api/auth");
    expect(Object.keys((corrected.components as Json).schemas as Json)).toEqual([
      "BetterAuthProblem",
    ]);
    const nullableAlready = correctAuthResponses(
      {
        paths: {},
        components: {
          schemas: { BetterAuthUser: { properties: { image: { type: ["string", "null"] } } } },
        },
      },
      "/api/auth",
    );
    expect(
      (
        (((nullableAlready.components as Json).schemas as Json).BetterAuthUser as Json)
          .properties as Json
      ).image,
    ).toEqual({ type: ["string", "null"] });
  });
});
