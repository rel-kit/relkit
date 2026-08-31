import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");
const read = (page: string) => readFileSync(resolve(content, `start/${page}.mdx`), "utf8");

test("keeps Start to three local onboarding guides before Service", () => {
  const pages = ["create-an-app", "first-route", "local-development"];
  expect(guideGroups.find(({ directory }) => directory === "start")?.pages).toEqual(pages);
  expect(JSON.parse(readFileSync(resolve(content, "start/meta.json"), "utf8"))).toEqual({
    title: "Start",
    icon: "Rocket",
    pages,
  });
  expect(readdirSync(resolve(content, "start")).sort()).toEqual([
    "create-an-app.mdx",
    "first-route.mdx",
    "local-development.mdx",
    "meta.json",
  ]);
  expect(guideRelations.find(({ path }) => path === "start/local-development")?.next).toBe(
    "service/index",
  );
  for (const page of ["check", "build", "production"]) {
    expect(guideRelations.some(({ path }) => path === `start/${page}`)).toBe(false);
    expect(existsSync(resolve(content, `../generated/related/start-${page}.mdx`))).toBe(false);
  }
});

test("connects the existing-app workflow to public service operations and capability guides", () => {
  expect(read("create-an-app")).toContain("--template api --cloud none --deploy none");
  expect(read("create-an-app")).toContain("does not remove the template's");
  expect(read("first-route")).toContain("../../templates/default/v1/api/src/hello/service.ts");
  expect(read("first-route")).toContain(
    "../../templates/default/v1/api/src/hello/functions/hello.function.ts",
  );
  expect(read("first-route")).toContain("../../templates/default/v1/api/src/routes/hello/route.ts");
  expect(read("first-route")).toContain("rather than overwriting it");
  const local = read("local-development");
  for (const command of ["bun run check", "bun run typecheck", "bun run test"])
    expect(local).toContain(command);
  for (const guide of [
    "service",
    "http",
    "events",
    "jobs",
    "database",
    "auth",
    "storage",
    "caching",
    "ai",
  ]) {
    expect(local).toContain(`](/docs/${guide})`);
  }
  for (const command of ["check", "build", "start"]) {
    expect(local).toContain(`/docs/operations/cli-reference#relkit-${command}`);
  }
  const landing = readFileSync(resolve(content, "index.mdx"), "utf8");
  expect(landing).toContain('href="/docs/service"');
  expect(landing).not.toContain("through a local production build");
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
