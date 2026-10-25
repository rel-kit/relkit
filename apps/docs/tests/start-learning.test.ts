/** Checks the certified starter journey and source-backed grouped tutorial links through finite synchronous read-only test adapters. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guideGroups, guideRelations, startJourney } from "../scripts/guide-catalog.js";
import { renderRelated } from "../scripts/generate-guides.js";
const content = resolve(import.meta.dir, "../content");
/** Reads one owned starter guide at the native synchronous test boundary.
 * @param page - Starter guide path selected by this suite.
 * @returns Original guide text; missing input fails the native test.
 */
const read = (page: string) => readFileSync(resolve(content, `docs/learn/${page}.mdx`), "utf8");
test("keeps a single ordered Orders journey with optional scaffolding last", async () => {
  const pages = [
    "index",
    ...startJourney.map((path) => path.slice("docs/learn/".length)),
    "concepts",
  ];
  expect(guideGroups.find(({ directory }) => directory === "docs/learn")?.pages).toEqual(pages);
  expect((await import("../content/docs/learn/meta.js")).default).toMatchObject({
    title: "Learn",
    pages,
  });
  for (const [index, path] of startJourney.entries()) {
    expect(existsSync(resolve(content, `${path}.mdx`))).toBe(true);
    const relation = guideRelations.find((item) => item.path === path);
    if (!relation) throw new Error(`Missing tutorial relation: ${path}`);
    expect(relation.next).toBe(startJourney[index + 1] ?? "docs/learn/concepts/index");
    expect(renderRelated(relation)).not.toContain("<Card");
    expect(renderRelated(relation)).toContain("Reference and source");
  }
  for (const page of ["check", "build", "production"]) {
    expect(guideRelations.some(({ path }) => path === `docs/learn/${page}`)).toBe(false);
    expect(existsSync(resolve(content, `_snippets/generated/related/start-${page}.mdx`))).toBe(
      false,
    );
  }
});
test("extends the certified minimal app into the same Orders journey", async () => {
  expect(read("create-an-app")).toContain("certified `minimal` template");
  expect(read("create-an-app")).toContain("/hello\\?name=RELKIT");
  expect(read("first-route")).toContain("templates/default/v1/api/src/routes/orders/route.ts");
  expect(read("first-route")).toContain(
    "templates/default/v1/api/src/services/orders/functions/create-order.function.ts",
  );
  expect(read("save-orders")).toContain("src/services/database/schema/index.ts");
  expect(read("protect-orders")).toContain("session's user ID");
  expect(read("test-orders")).toContain("bun run test");
  expect(read("build-and-run")).toContain("bun run start");
  const landing = readFileSync(resolve(content, "docs/index.mdx"), "utf8");
  expect(landing).toContain('href="/docs/learn/create-an-app"');
});
test("redirects retired Start URLs directly to current guidance", async () => {
  const config = (await import("../redirects.json")).default;
  for (const [source, destination] of [
    ["check-build-deploy", "/docs/learn/local-development#verify-changes"],
    ["check", "/docs/learn/local-development#verify-changes"],
    ["build", "/docs/api/cli#relkit-build"],
    ["production", "/docs/api/cli#relkit-start"],
  ] as const) {
    expect(config).toContainEqual({ from: `/docs/start/${source}`, to: destination, status: 301 });
  }
});
