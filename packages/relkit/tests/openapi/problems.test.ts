/** Each operation declares the Problem Details responses the runtime can send for it, no others. */
import { expect, test } from "vitest";
import type { ApplicationGraph } from "../../src/graph/index.js";
import { generateOpenApi, type OpenApiOperation } from "../../src/openapi/index.js";
import { graph } from "./generate-fixture.js";

const PROBLEM_REF = { $ref: "#/components/schemas/Problem" };
const answers = [{ kind: "success", id: "success.200", status: 200, schema: null }];

interface Change {
  readonly access?: unknown;
  readonly auth?: boolean;
  readonly rateLimit?: { readonly limit: number; readonly windowMs: number; readonly key: string };
  readonly request?: unknown;
  readonly input?: unknown;
  readonly responses?: readonly unknown[];
  readonly path?: string;
}

/** The fixture's GET route with its declarations changed, as a generated operation. */
function operationFor(change: Change): {
  readonly operation: OpenApiOperation;
  readonly document: ReturnType<typeof generateOpenApi>;
} {
  const source = graph(false);
  const nodes = source.nodes.map((node) => {
    if (node.kind === "function")
      return {
        ...node,
        ...("access" in change ? { access: change.access } : {}),
        ...("input" in change ? { input: change.input } : {}),
      };
    if (node.kind !== "trigger") return node;
    return {
      ...node,
      config: {
        ...node.config,
        responses: change.responses ?? answers,
        ...("path" in change ? { path: change.path } : {}),
        ...("request" in change ? { request: change.request } : {}),
        ...(change.auth === true ? { auth: { kind: "required" } } : {}),
        ...(change.rateLimit === undefined ? {} : { rateLimit: change.rateLimit }),
      },
    };
  });
  const document = generateOpenApi({ ...source, nodes } as unknown as ApplicationGraph);
  const operation = Object.values(document.paths)[0]?.get;
  if (operation === undefined) throw new Error("missing operation");
  return { operation, document };
}

/** The statuses an operation declares, in order. */
function statuses(change: Change): string[] {
  return Object.keys(operationFor(change).operation.responses).sort();
}

const mapping = (...fields: readonly (readonly [string, object])[]) => ({
  kind: "input",
  fields: Object.fromEntries(fields),
});
const path = ["id", { kind: "path", name: "id" }] as const;
const body = ["sku", { kind: "body", name: "sku" }] as const;

test("an operation that reads a body declares the validation and oversize answers and 500", () => {
  expect(statuses({ request: mapping(path, body) })).toEqual(["200", "413", "422", "500"]);
  expect(statuses({})).toEqual(["200", "413", "422", "500"]);
});

test("an operation that cannot have a body does not declare 413", () => {
  expect(statuses({ request: mapping(path) })).toEqual(["200", "422", "500"]);
});

test("an operation without input declares neither 413 nor 422", () => {
  expect(statuses({ path: "/orders", request: null, input: null })).toEqual(["200", "500"]);
  expect(statuses({ path: "/orders", request: null, input: [] })).toEqual(["200", "500"]);
  expect(
    statuses({ path: "/orders", request: null, input: { $relkit: "schema", jsonSchema: [] } }),
  ).toEqual(["200", "500"]);
  expect(
    statuses({ path: "/orders", request: null, input: { type: "object", properties: {} } }),
  ).toEqual(["200", "500"]);
});

test("input the request mapping leaves to the function schema still declares 422", () => {
  const required = { type: "object", required: ["id"] };
  expect(statuses({ path: "/orders", request: null, input: required })).toEqual([
    "200",
    "422",
    "500",
  ]);
  const wrapped = { $relkit: "schema", jsonSchema: { type: "object", properties: { id: {} } } };
  expect(statuses({ path: "/orders", request: null, input: wrapped })).toEqual([
    "200",
    "422",
    "500",
  ]);
});

test("generated problems refer to one shared Problem component", () => {
  const { operation, document } = operationFor({
    access: { roles: ["admin"] },
    request: mapping(path, body),
  });
  for (const status of ["401", "403", "500"])
    expect(operation.responses[status]?.content?.["application/problem+json"]?.schema).toEqual(
      PROBLEM_REF,
    );
  const narrowed = ["413", "422"].map(
    (status) => operation.responses[status]?.content?.["application/problem+json"]?.schema,
  );
  for (const schema of narrowed) expect(schema).toMatchObject({ allOf: [PROBLEM_REF, {}] });
  expect(narrowed[0]).toMatchObject({
    allOf: [
      PROBLEM_REF,
      { properties: { status: { const: 413 }, code: { const: "payload-too-large" } } },
    ],
  });
  expect(narrowed[1]).toMatchObject({
    allOf: [PROBLEM_REF, { required: ["issues"], properties: { code: { const: "validation" } } }],
  });
  expect(document.components?.schemas?.Problem).toMatchObject({
    type: "object",
    required: ["type", "title", "status", "code", "detail"],
    properties: { traceId: { type: "string" }, requestId: { type: "string" } },
  });
});

test("401 and 403 follow the access rule, and route authentication alone declares 401", () => {
  expect(statuses({ access: { roles: ["admin"] } })).toEqual(
    expect.arrayContaining(["401", "403"]),
  );
  const authOnly = statuses({ auth: true });
  expect(authOnly).toContain("401");
  expect(authOnly).not.toContain("403");
  const open = statuses({});
  expect(open).not.toContain("401");
  expect(open).not.toContain("403");
});

test("a rate limited operation declares 429 with the rate limit headers", () => {
  const limited = operationFor({ rateLimit: { limit: 5, windowMs: 1000, key: "ip" } }).operation;
  const response = limited.responses["429"];
  expect(response?.content?.["application/problem+json"]?.schema).toMatchObject({
    allOf: [
      PROBLEM_REF,
      {
        required: ["data"],
        properties: {
          code: { const: "rate-limited" },
          data: { required: ["retryAfterMs"] },
        },
      },
    ],
  });
  expect(Object.keys(response?.headers ?? {})).toContain("Retry-After");
  expect(statuses({})).not.toContain("429");
});

test("a response the route declares wins over the generated one", () => {
  const { operation } = operationFor({
    responses: [
      ...answers,
      { kind: "response", id: "own.500", status: 500, schema: { type: "string" } },
      { kind: "validation-error", id: "own.422", status: 422, schema: null },
      { kind: "response", id: "own.413", status: 413, schema: null },
    ],
    access: { roles: ["admin"] },
  });
  expect(operation.responses["500"]?.description).toBe("Response own.500");
  expect(operation.responses["413"]?.description).toBe("Response own.413");
  expect(operation.responses["422"]?.description).toBe("Validation error");
  expect(operation.responses["422"]?.content?.["application/problem+json"]?.schema).toMatchObject({
    required: ["type", "title", "status", "code", "detail", "issues"],
  });
  expect(operation.responses["401"]?.description).toBe("No signed-in session");
});

test("a declared error without a schema refers to the shared Problem component", () => {
  const { operation } = operationFor({
    responses: [...answers, { kind: "response", id: "teapot", status: 418 }],
  });
  expect(operation.responses["418"]?.content?.["application/problem+json"]?.schema).toEqual(
    PROBLEM_REF,
  );
});

test("a response without a body does not stop the Problem component from being added", () => {
  const { document } = operationFor({
    responses: [{ kind: "success", id: "gone", status: 204, schema: null }],
  });
  expect(Object.keys(document.components?.schemas ?? {})).toEqual(["Problem"]);
});
