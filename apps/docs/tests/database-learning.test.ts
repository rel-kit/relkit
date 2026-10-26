/** Checks authored database guidance and grouped native examples through finite synchronous read-only source assertions. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiPackages } from "../scripts/documentation-catalog.js";
import { databaseGuideGroup } from "../scripts/database-guide-catalog.js";
import { features } from "../scripts/feature-catalog.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
const content = resolve(import.meta.dir, "../content");
/** Reads one owned database guide at the native synchronous test boundary.
 * @param page - Database guide path selected by this suite.
 * @returns Original guide text; missing input fails the native test.
 */
const read = (page: string) =>
  readFileSync(
    resolve(
      content,
      page === "first-database"
        ? "guides/database/register-users-in-a-transaction.mdx"
        : `docs/modules/database/${page}.mdx`,
    ),
    "utf8",
  );
test("connects Database guides and the generated Drizzle reference", async () => {
  const groups = guideGroups.map(({ directory }) => directory);
  expect(
    groups.slice(groups.indexOf("docs/modules/jobs"), groups.indexOf("docs/modules/storage") + 1),
  ).toEqual([
    "docs/modules/jobs",
    "docs/modules/database",
    "docs/modules/auth",
    "docs/modules/storage",
  ]);
  expect((await import("../content/docs/modules/database/meta.js")).default).toMatchObject({
    title: "Database",
    pages: databaseGuideGroup.pages,
  });
  expect(apiPackages).toContain("drizzle");
  expect(features.find(({ id }) => id === "database")?.guide).toBe("docs/modules/database/index");
  expect(
    guideRelations.find(({ path }) => path === "docs/modules/jobs/troubleshooting")?.next,
  ).toBeUndefined();
  expect(
    guideRelations.find(({ path }) => path === "guides/database/register-users-in-a-transaction")
      ?.next,
  ).toBeUndefined();
  for (const page of databaseGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(`/_snippets/generated/related/docs-modules-database-${page}.mdx`);
    if (page !== "index") expect(read("index")).toContain(`](/docs/modules/database/${page})`);
  }
});
test("uses application workflows and Drizzle Kit rather than SQL bootstrap or test snippets", async () => {
  const tutorial = read("first-database");
  expect(tutorial).toContain("existing RELKIT app");
  for (const path of [
    "src/platform/env.ts",
    "src/services/database/service.ts",
    "src/services/database/schema/index.ts",
    "src/services/database/models/users.model.ts",
    "src/services/users/functions/list-users.function.ts",
    "src/services/users/service.ts",
    "src/routes/users/route.ts",
    "src/services/users/functions/register-member.function.ts",
    "src/services/users/functions/update-user-email.function.ts",
    "drizzle.config.ts",
  ])
    expect(tutorial).toContain(`examples/data-model/${path}`);
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("bun test tests/registration.test.ts");
  expect(read("migrations")).toContain("examples/data-model/drizzle.config.ts");
  expect(read("migrations")).toContain("drizzle-kit generate");
  expect(read("migrations")).toContain("relkit db migrate");
  expect(read("testing")).toContain("examples/data-model/tests/migrations.test.ts");
  for (const page of databaseGuideGroup.pages) {
    const source = read(page);
    expect(source).not.toMatch(/lang="sql"|```sql|\bCREATE TABLE\b|sqlite\.exec/i);
    if (page !== "testing") expect(source).not.toMatch(/\.\.\/\.\.\/examples\/[^\n]+\.test\.ts/);
  }
  const service = readFileSync(
    resolve(import.meta.dir, "../../../examples/data-model/src/services/database/service.ts"),
    "utf8",
  );
  expect(service).not.toMatch(/\.exec\(|create table/i);
});
test("states validation, override, transaction, and lifecycle boundaries", async () => {
  expect(read("index")).toContain("MongoDB and Prisma integrations are planned");
  expect(read("index")).not.toContain("defineDrizzleService");
  expect(read("drizzle")).toContain("Only one Drizzle service");
  expect(read("define")).toContain("does not replace this custom client factory");
  expect(read("schema")).toContain("does not automatically run these Zod schemas");
  expect(read("queries")).toContain("not a native atomic conflict");
  expect(read("models")).toContain("bypass the portable CRUD implementation");
  expect(read("overrides")).toContain("not a complete soft-delete or access-control policy");
  expect(read("transactions")).toContain("ordinary operations outside the helper are not gated");
  expect(read("testing")).toContain("closing it does not currently remove the cache");
});
test("explains generated data shapes and Better Auth's native-client boundary", async () => {
  const schemas = read("generated-schemas");
  for (const name of [
    "createSelectSchema",
    "createInsertSchema",
    "createUpdateSchema",
    "safeParse",
    "refine",
  ])
    expect(schemas).toContain(name);
  expect(schemas).toContain("not the complete CRUD argument wrapper");
  expect(schemas).toContain("does not automatically run these Zod schemas");
  expect(read("transactions")).toContain(
    "src/services/users/functions/register-member.function.ts",
  );
  const auth = read("better-auth");
  expect(auth).toContain("native Drizzle client");
  expect(auth).toContain("Do not set `database` or `basePath`");
  expect(auth).toContain("not pass through RELKIT's portable CRUD");
  expect(auth).toContain("drizzle-kit generate --name=better-auth");
});
