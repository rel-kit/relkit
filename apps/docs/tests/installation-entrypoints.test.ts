/**
 * Guards the installation boundary on direct-entry guides. A feature snippet
 * must follow its selected setup or an explicit prerequisite, while scaffold
 * journeys keep their normal automatic install and explicit deferred path.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reads an authored guide so setup ordering is checked before MDX expansion.
 * @param page - Catalog guide ID without extension.
 * @returns Authored content including selected include references.
 */
function guide(page: string): string {
  return readFileSync(resolve(import.meta.dir, `../content/${page}.mdx`), "utf8");
}

test("manual database/auth entry points establish complete installs before feature source", async () => {
  for (const [page, recipe] of [
    ["docs/modules/database/define", "database"],
    ["docs/modules/database/better-auth", "auth"],
    ["docs/modules/auth/better-auth", "auth"],
  ] as const) {
    const source = guide(page);
    const setup = source.indexOf(`/_snippets/generated/installations/${recipe}.mdx`);
    expect(setup, page).toBeGreaterThan(0);
    expect(setup, page).toBeLessThan(source.search(/<include\s+source=/));
    expect(source).not.toContain("@0.0.5");
  }
});

test("database and auth scaffolds explain deferred install without requiring duplicate manual setup", async () => {
  for (const page of [
    "guides/database/register-users-in-a-transaction",
    "guides/auth/email-password-sign-in",
    "docs/learn/save-orders",
    "docs/learn/protect-orders",
  ]) {
    const source = guide(page);
    expect(source).toContain("--no-install");
    expect(source).toContain("bun install");
    expect(source).toMatch(/patch|repair/);
  }
});

test("database continuations link setup before their first feature-dependent example", async () => {
  for (const page of [
    "drizzle",
    "generated-schemas",
    "migrations",
    "models",
    "overrides",
    "queries",
    "schema",
    "testing",
    "transactions",
  ]) {
    const source = guide(`docs/modules/database/${page}`);
    const prerequisite = source.indexOf("/docs/modules/database/define");
    expect(prerequisite, page).toBeGreaterThan(0);
    const example = source.search(/<include\s+source=|```sh/);
    if (example !== -1) expect(prerequisite, page).toBeLessThan(example);
  }
});

test("auth continuations establish backend setup before consuming its service", async () => {
  for (const page of ["customization", "protect-routes", "sessions", "testing"]) {
    const source = guide(`docs/modules/auth/${page}`);
    const prerequisite = source.indexOf("/docs/modules/auth/better-auth");
    expect(prerequisite, page).toBeGreaterThan(0);
    const example = source.search(/<include\s+source=|```sh/);
    if (example !== -1) expect(prerequisite, page).toBeLessThan(example);
  }
});

test("adding native services updates existing application test fixtures as well as new tests", async () => {
  expect(guide("docs/learn/save-orders")).toContain("@relkit/testing/drizzle");
  const source = readFileSync(
    resolve(
      import.meta.dir,
      "../examples/orders-tutorial/steps/database/tests/integration/hello.route.test.ts",
    ),
    "utf8",
  );
  expect(source).toContain('from "@relkit/testing/drizzle"');
  expect(source).not.toContain('from "@relkit/testing"');
  expect(guide("docs/learn/protect-orders")).toContain("@relkit/testing/better-auth");
});
