/**
 * Fixture tests for `better-auth-account-issuer`: the account table of each Drizzle dialect loses
 * the `issuer` column Better Auth 1.7.3 and later never write, with the index entries that read
 * it and the imports only those entries used. Other tables, other indexes and shapes the rule
 * cannot rewrite safely stay as they are; the last are reported.
 */
import { describe, expect, test } from "bun:test";
import { betterAuthAccountIssuerRule } from "../../../src/migration/code-rules/better-auth-account-issuer.js";
import { codeRules } from "../../../src/migration/code-rules/index.js";
import { expectFixture } from "./fixture.js";

const messages = (result: { findings: readonly { line: number; message: string }[] }) =>
  result.findings.map((finding) => [finding.line, finding.message.split(":")[0]!.split(",")[0]]);

describe("better-auth-account-issuer", () => {
  test("removes the column, its unique index and the unused import from a SQLite schema", () => {
    const result = expectFixture(
      betterAuthAccountIssuerRule,
      "sqlite",
      "src/services/database/schema/auth.ts",
    );
    expect(messages(result)).toEqual([[17, "Removed account.issuer"]]);
    expect(result.findings[0]!.message).toContain("db:generate");
  });

  test("keeps the organization plugin's tables and the imports they still use", () => {
    const result = expectFixture(
      betterAuthAccountIssuerRule,
      "organization",
      "src/services/database/schema/auth.ts",
    );
    expect(messages(result)).toEqual([[3, "Removed account.issuer"]]);
  });

  test("keeps the account table's other index entries", () => {
    expectFixture(betterAuthAccountIssuerRule, "entries", "src/db/schema.ts");
  });

  test("reports an index callback it cannot rewrite and leaves the file unchanged", () => {
    const result = expectFixture(betterAuthAccountIssuerRule, "unknown", "src/db/schema.ts");
    expect(messages(result)).toEqual([
      [12, "Better Auth 1.7.3 and later never write account.issuer"],
    ]);
  });

  test("reads TypeScript and JavaScript sources only and runs after the Better Auth file rule", () => {
    expect(betterAuthAccountIssuerRule.appliesTo("src/db/schema.ts")).toBe(true);
    expect(betterAuthAccountIssuerRule.appliesTo("src/db/schema.mjs")).toBe(true);
    expect(betterAuthAccountIssuerRule.appliesTo("src/db/schema.d.ts")).toBe(false);
    expect(betterAuthAccountIssuerRule.appliesTo("drizzle/0001_snapshot.json")).toBe(false);
    const ids = codeRules.map((rule) => rule.id);
    expect(ids.indexOf("better-auth-account-issuer")).toBe(ids.indexOf("better-auth-file") + 1);
  });
});
