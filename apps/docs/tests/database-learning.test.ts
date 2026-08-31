import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiPackages } from "../scripts/documentation-catalog.js";
import { databaseGuideGroup } from "../scripts/database-guide-catalog.js";
import { features } from "../scripts/feature-catalog.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");
const read = (page: string) => readFileSync(resolve(content, `database/${page}.mdx`), "utf8");

test("connects Database guides and the generated Drizzle reference", () => {
  const groups = guideGroups.map(({ directory }) => directory);
  expect(groups.slice(groups.indexOf("jobs"), groups.indexOf("storage") + 1)).toEqual([
    "jobs",
    "database",
    "auth",
    "storage",
  ]);
  expect(JSON.parse(readFileSync(resolve(content, "database/meta.json"), "utf8"))).toEqual({
    title: "Database",
    icon: "Database",
    pages: databaseGuideGroup.pages,
  });
  expect(apiPackages).toContain("drizzle");
  expect(features.find(({ id }) => id === "database")?.guide).toBe("database/index");
  expect(guideRelations.find(({ path }) => path === "jobs/first-job")?.next).toBe("database/index");
  expect(guideRelations.find(({ path }) => path === "database/first-database")?.next).toBe(
    "auth/index",
  );
  for (const page of databaseGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(/```sh|<include[^>]*lang="ts"/);
    expect(source).toContain(`content/generated/related/database-${page}.mdx`);
    if (page !== "index") expect(read("index")).toContain(`](/docs/database/${page})`);
  }
});

test("uses application workflows and Drizzle Kit rather than SQL bootstrap or test snippets", () => {
  const tutorial = read("first-database");
  expect(tutorial).toContain("existing RELKIT app");
  for (const path of [
    "src/platform/env.ts",
    "src/database/service.ts",
    "src/database/schema/index.ts",
    "src/database/models/users.model.ts",
    "src/users/functions/list-users.function.ts",
    "src/users/service.ts",
    "src/routes/users/route.ts",
    "src/users/functions/register-member.function.ts",
    "src/users/functions/update-user-email.function.ts",
    "drizzle.config.ts",
  ])
    expect(tutorial).toContain(`../../examples/data-model/${path}`);
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("bun test tests/data-model.test.ts");
  expect(read("migrations")).toContain("../../examples/data-model/drizzle.config.ts");
  expect(read("migrations")).toContain("drizzle-kit generate");
  expect(read("migrations")).toContain("drizzle-kit migrate");
  expect(read("testing")).toContain("../../examples/data-model/tests/migrations.test.ts");
  for (const page of databaseGuideGroup.pages) {
    const source = read(page);
    expect(source).not.toMatch(/lang="sql"|```sql|\bCREATE TABLE\b|sqlite\.exec/i);
    if (page !== "testing") expect(source).not.toMatch(/\.\.\/\.\.\/examples\/[^\n]+\.test\.ts/);
  }
  const service = readFileSync(
    resolve(content, "../../../../examples/data-model/src/database/service.ts"),
    "utf8",
  );
  expect(service).not.toMatch(/\.exec\(|create table/i);
});

test("states validation, override, transaction, and lifecycle boundaries", () => {
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

test("explains generated data shapes and Better Auth's native-client boundary", () => {
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
  expect(read("transactions")).toContain("src/users/functions/register-member.function.ts");
  const auth = read("better-auth");
  expect(auth).toContain("native Drizzle client");
  expect(auth).toContain("Do not set `database` or `basePath`");
  expect(auth).toContain("not pass through RELKIT's portable CRUD");
  expect(auth).toContain("drizzle-kit generate --name=better-auth");
});
