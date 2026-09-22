import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guideGroups, guideRelations, startJourney } from "../scripts/guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");
const read = (page: string) => readFileSync(resolve(content, `start/${page}.mdx`), "utf8");

test("keeps a single ordered Orders journey with optional scaffolding last", () => {
  const pages = [...startJourney.map((path) => path.slice(6)), "add-artifacts"];
  expect(guideGroups.find(({ directory }) => directory === "start")?.pages).toEqual(pages);
  expect(JSON.parse(readFileSync(resolve(content, "start/meta.json"), "utf8"))).toEqual({
    title: "Start",
    icon: "Rocket",
    pages,
  });
  for (const [index, path] of startJourney.entries()) {
    expect(existsSync(resolve(content, `${path}.mdx`))).toBe(true);
    expect(guideRelations.find((item) => item.path === path)?.next).toBe(
      startJourney[index + 1] ?? "fundamentals/index",
    );
  }
  for (const page of ["check", "build", "production"]) {
    expect(guideRelations.some(({ path }) => path === `start/${page}`)).toBe(false);
    expect(existsSync(resolve(content, `../generated/related/start-${page}.mdx`))).toBe(false);
  }
});

test("uses the same Orders app from creation through the production build", () => {
  expect(read("create-an-app")).toContain("--template api");
  expect(read("create-an-app")).toContain("POST http://localhost:3000/orders");
  expect(read("first-route")).toContain("../../templates/default/v1/api/src/routes/orders/route.ts");
  expect(read("save-orders")).toContain("src/database/schema/index.ts");
  expect(read("protect-orders")).toContain("session's user ID");
  expect(read("test-orders")).toContain("bun run test");
  expect(read("build-and-run")).toContain("bun run start");
  const landing = readFileSync(resolve(content, "index.mdx"), "utf8");
  expect(landing).toContain('href="/docs/fundamentals"');
});

test("redirects retired Start URLs directly to current guidance", () => {
  const config = readFileSync(resolve(import.meta.dir, "../next.config.mjs"), "utf8");
  for (const [source, destination] of [
    ["check-build-deploy", "/docs/start/local-development#verify-changes"],
    ["check", "/docs/start/local-development#verify-changes"],
    ["build", "/docs/operations/cli-reference#relkit-build"],
    ["production", "/docs/operations/cli-reference#relkit-start"],
  ]) {
    expect(config).toContain(`["/docs/start/${source}", "${destination}"]`);
  }
});
