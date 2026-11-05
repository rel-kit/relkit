/**
 * Fixture tests for the single-file rename rules: the schema builder, removed aliases, legacy
 * jobs, explicit error IDs and `defineServiceRoutes` exports. Each case checks the exact output,
 * that a second run changes nothing, and the lines reported for code left unchanged.
 */
import { describe, expect, test } from "bun:test";
import { schemaBuilderRule } from "../../../src/migration/code-rules/schema-builder.js";
import { removedAliasesRule } from "../../../src/migration/code-rules/removed-aliases.js";
import { legacyJobsRule } from "../../../src/migration/code-rules/legacy-jobs.js";
import { errorIdsRule } from "../../../src/migration/code-rules/error-ids.js";
import { serviceRoutesRule } from "../../../src/migration/code-rules/service-routes.js";
import { routeAuthRule } from "../../../src/migration/code-rules/route-auth.js";
import { problemDetailsRule } from "../../../src/migration/code-rules/problem-details.js";
import { expectFixture, testContext } from "./fixture.js";

const lines = (result: { findings: readonly { line: number }[] }) =>
  result.findings.map((finding) => finding.line);

describe("schema-builder", () => {
  test("renames z to s and its references, keeping zod alone", () => {
    expect(lines(expectFixture(schemaBuilderRule, "rename", "src/order.schema.ts"))).toEqual([]);
  });

  test("aliases the import when s is already taken", () => {
    expectFixture(schemaBuilderRule, "taken", "src/order.schema.ts");
  });
});

describe("removed-aliases", () => {
  test("renames exports, the builder's undefined() and option keys", () => {
    expect(lines(expectFixture(removedAliasesRule, "aliases", "relkit.config.ts"))).toEqual([]);
  });

  test("merges into an existing import and reports a key set twice", () => {
    const result = expectFixture(removedAliasesRule, "both", "src/schemas.ts");
    expect(result.findings.map((finding) => [finding.line, finding.message])).toEqual([
      [6, "Both profile and service are set; keep only service."],
    ]);
  });
});

describe("removed-aliases effects", () => {
  test("moves tool invokeEffect to callToolEffect and reports other receivers", () => {
    expect(lines(expectFixture(removedAliasesRule, "effects", "src/agents/run.ts"))).toEqual([5]);
  });
});

describe("legacy-jobs", () => {
  test("reports legacy jobs and rewrites enqueue to trigger", () => {
    const result = expectFixture(legacyJobsRule, "legacy", "src/jobs/send.job.ts");
    expect(result.findings.map((finding) => [finding.line, finding.message.slice(0, 31)])).toEqual([
      [4, "Legacy defineJob runs a functio"],
      [8, "Job runs report runId instead o"],
    ]);
  });
});

describe("error-ids", () => {
  test("writes the inferred ID and reports errors without a binding", () => {
    const result = expectFixture(
      errorIdsRule,
      "errors",
      "src/orders/functions/get-order.function.ts",
    );
    expect(lines(result)).toEqual([12]);
  });
});

describe("service-routes", () => {
  test("exports the map as default", () => {
    expect(lines(expectFixture(serviceRoutesRule, "routes", "src/routes/orders/route.ts"))).toEqual(
      [],
    );
  });

  test("reports a module that reads a destructured handler", () => {
    expect(lines(expectFixture(serviceRoutesRule, "used", "src/routes/orders/route.ts"))).toEqual([
      4,
    ]);
  });
});

describe("route-auth", () => {
  const sources = new Map([
    [
      "src/routes/api/auth/[[...auth]]/route.ts",
      'export const ALL = defineRoute({\n  handler: auth.handler,\n  auth: { protected: ["/account/*", "/mcp"] },\n});\n',
    ],
    ["src/routes/account/profile/route.ts", ""],
  ]);
  const context = testContext({ sources });

  test("removes the protected list and reports paths without a route module", () => {
    const result = expectFixture(
      routeAuthRule,
      "auth-route",
      "src/routes/api/auth/[[...auth]]/route.ts",
      context,
    );
    expect(result.findings.map((finding) => [finding.line, finding.message.slice(0, 26)])).toEqual([
      [7, "Protect the MCP endpoint w"],
    ]);
  });

  test("requires a session on routes the list protected", () => {
    expect(
      expectFixture(routeAuthRule, "profile", "src/routes/account/profile/route.ts", context)
        .findings,
    ).toEqual([]);
  });
});

describe("problem-details", () => {
  test("reports reads of the old error field and changes nothing", () => {
    expect(lines(expectFixture(problemDetailsRule, "client", "tests/orders.test.ts"))).toEqual([
      5, 6,
    ]);
  });
});
