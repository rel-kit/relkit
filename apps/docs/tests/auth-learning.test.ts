/** Checks authored auth guidance against repository-owned source facts using finite synchronous read-only test adapters. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { authGuideGroup } from "../scripts/auth-guide-catalog.js";
import { apiPackages } from "../scripts/documentation-catalog.js";
import { features } from "../scripts/feature-catalog.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
const content = resolve(import.meta.dir, "../content");
/** Reads one owned auth guide at the native synchronous test boundary.
 * @param page - Auth guide path selected by this suite.
 * @returns Original guide text; missing input fails the native test.
 */
const read = (page: string) =>
  readFileSync(
    resolve(
      content,
      page === "first-auth"
        ? "guides/auth/email-password-sign-in.mdx"
        : `docs/modules/auth/${page}.mdx`,
    ),
    "utf8",
  );
test("connects Auth after Database with source-backed guides and API reference", async () => {
  const groups = guideGroups.map(({ directory }) => directory);
  expect(
    groups.slice(
      groups.indexOf("docs/modules/database"),
      groups.indexOf("docs/modules/storage") + 1,
    ),
  ).toEqual(["docs/modules/database", "docs/modules/auth", "docs/modules/storage"]);
  expect((await import("../content/docs/modules/auth/meta.js")).default).toMatchObject({
    title: "Auth",
    pages: authGuideGroup.pages,
  });
  expect(apiPackages).toContain("better-auth");
  expect(features.find(({ id }) => id === "auth")?.guide).toBe("docs/modules/auth/index");
  expect(
    guideRelations.find(({ path }) => path === "guides/database/register-users-in-a-transaction")
      ?.next,
  ).toBeUndefined();
  expect(
    guideRelations.find(({ path }) => path === "guides/auth/email-password-sign-in")?.next,
  ).toBeUndefined();
  for (const page of authGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(`/_snippets/generated/related/docs-modules-auth-${page}.mdx`);
    expect(source).not.toMatch(/lang="sql"|```sql|\bCREATE TABLE\b|sqlite\.exec/i);
    if (page !== "testing") expect(source).not.toMatch(/\.\.\/\.\.\/examples\/[^\n]+\.test\.ts/);
    if (page !== "index") expect(read("index")).toContain(`](/docs/modules/auth/${page})`);
  }
});
test("separates identity, integration, transport protection, and business authorization", async () => {
  expect(read("index")).toContain("Authorization decides");
  expect(read("index")).not.toContain("defineBetterAuthService");
  expect(read("better-auth")).toContain("not an `({ env })` factory");
  expect(read("sessions")).toContain("not an application-wide identity cache");
  expect(read("sessions")).toContain("resolves to `null`");
  expect(read("protect-routes")).toContain(
    "mounted auth base path and its descendants remain reachable",
  );
  expect(read("protect-routes")).toContain("not every direct invocation");
  expect(read("clients")).toContain("`trustedOrigins` is not CORS");
  expect(read("clients")).toContain("does **not** enable Better Auth bearer-token support");
  expect(read("customization")).toContain("additionalFields");
  expect(read("customization")).toContain("Adding options does not migrate a database");
  expect(read("testing")).toContain("relaxes origin checks in its test environment");
});
test("teaches a migrated existing-app flow without hard-coded server secrets", async () => {
  const tutorial = read("first-auth");
  expect(tutorial).toContain("existing RELKIT app");
  for (const path of [
    "relkit.config.ts",
    "drizzle.config.ts",
    "src/services/database/schema/index.ts",
    "src/services/database/service.ts",
    "src/services/auth/service.ts",
    "src/services/account/service.ts",
    "src/services/account/functions/session.function.ts",
    "src/routes/session/route.ts",
    "src/routes/account/profile/route.ts",
    "src/routes/api/auth/[[...auth]]/route.ts",
  ])
    expect(tutorial).toContain(`examples/auth-drizzle/${path}`);
  for (const operation of ["sign-up/email", "sign-in/email", "sign-out", "account/profile"]) {
    expect(tutorial).toContain(operation);
  }
  expect(tutorial).toContain("drizzle-kit generate");
  expect(tutorial).toContain("relkit db migrate");
  const example = resolve(import.meta.dir, "../../../examples/auth-drizzle");
  expect(readFileSync(resolve(example, "src/services/database/service.ts"), "utf8")).not.toMatch(
    /\.exec\(|create table/i,
  );
  expect(readFileSync(resolve(example, "src/services/auth/service.ts"), "utf8")).not.toContain(
    "secret:",
  );
  expect(readFileSync(resolve(example, "relkit.config.ts"), "utf8")).toContain(
    "BETTER_AUTH_SECRET: env.secret()",
  );
});
