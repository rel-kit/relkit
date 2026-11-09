/**
 * Fixture harness for `relkit migrate` codemod rules. Each case is a pair of text files under
 * `fixtures/<rule>/`: `<case>.before.txt` is the 0.8 source and `<case>.after.txt` the exact
 * expected output. Text files keep the 0.8 code away from the type checker and the formatter.
 */
import { readFileSync, existsSync } from "node:fs";
import { expect } from "bun:test";
import type {
  CodeRule,
  CodeRuleContext,
  CodeRuleResult,
} from "../../../src/migration/code-migration.types.js";

const fixtures = new URL("./fixtures/", import.meta.url);

/** Root names a test project's `relkit` exports. */
export const testRootExports = new Set([
  "defineApp",
  "defineConstants",
  "definePrompt",
  "defineFunction",
  "defineError",
  "getRelkit",
  "createRelkit",
  "env",
]);

/**
 * Builds a rule context with test defaults.
 * @param overrides - Fields a case needs, such as other project sources.
 * @returns A complete rule context.
 */
export function testContext(overrides: Partial<CodeRuleContext> = {}): CodeRuleContext {
  return {
    sources: new Map(),
    root: "/project",
    rootExports: testRootExports,
    version: "0.9.0",
    ...overrides,
  };
}

/**
 * Reads one fixture file.
 * @param rule - Rule folder.
 * @param name - File name inside it.
 * @returns The file text.
 */
export function readFixture(rule: string, name: string): string {
  return readFileSync(new URL(`${rule}/${name}`, fixtures), "utf8");
}

/**
 * Runs a rule over a fixture's before text and checks it produces the after text exactly,
 * then checks a second run changes nothing.
 * @param rule - Rule under test.
 * @param name - Case name.
 * @param path - Virtual project path the case pretends to be.
 * @param context - Rule context.
 * @returns The first run's result, for finding assertions.
 */
export function expectFixture(
  rule: CodeRule,
  name: string,
  path: string,
  context: CodeRuleContext = testContext(),
): CodeRuleResult {
  const before = readFixture(rule.id, `${name}.before.txt`);
  const afterName = `${name}.after.txt`;
  const after = existsSync(new URL(`${rule.id}/${afterName}`, fixtures))
    ? readFixture(rule.id, afterName)
    : before;
  expect(rule.appliesTo(path)).toBe(true);
  const result = rule.apply({ path, text: before }, context);
  expect(result.text).toBe(after);
  const again = rule.apply({ path, text: result.text }, context);
  expect(again.text).toBe(result.text);
  return result;
}
