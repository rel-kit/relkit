/** Keeps frontend examples on the owning declaration and checks that shared source-backed companions cannot disappear silently. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withFrontendExample } from "../scripts/api-frontend.js";
import { frontendExamples } from "../scripts/frontend-examples.js";
import { sourceIncludes, sourceRegion } from "../scripts/source-snippets.js";

const root = resolve(import.meta.dir, "../../..");

test("places the frontend beside the exact API without consuming the following entry", () => {
  const source = [
    "## `define-route.ts`",
    "",
    "### defineRoute",
    "",
    "Backend contract.",
    "",
    "````md",
    "### defineRoute",
    "```ts",
    "const value = 1;",
    "```",
    "````",
    "",
    "### defineRouteEffect",
    "",
    "Another contract.",
  ].join("\n");
  const result = withFrontendExample(source, "packages/routes/src/define-route.ts");
  expect(result).toContain("#### Backend and frontend example");
  expect(result.indexOf("/_frontend/echo.mdx")).toBeLessThan(
    result.indexOf("### defineRouteEffect"),
  );
  expect(result).toContain("````md\n### defineRoute\n```ts\nconst value = 1;\n```\n````");
  expect(result.match(/#### Backend and frontend example/g)).toHaveLength(1);
});

test("does not attach task-first clients to a same-named legacy job factory", () => {
  const source = "## `legacy-define-job.ts`\n\n### defineJob\n\nLegacy contract.";
  expect(withFrontendExample(source, "packages/jobs/src/legacy-define-job.ts")).toBe(source);
  expect(withFrontendExample(source, "packages/jobs/src/define-job.ts")).toContain(
    "/_frontend/job.mdx",
  );
});

test("fails when a configured symbol disappears or becomes ambiguous", () => {
  expect(() => withFrontendExample("### renamed", "packages/routes/src/define-route.ts")).toThrow(
    "Expected one",
  );
  expect(() =>
    withFrontendExample(
      "### defineRoute\n\n### defineRoute",
      "packages/routes/src/define-route.ts",
    ),
  ).toThrow("Expected one");
});

test("every companion contains maintained frontend code and an inline generated reference example", () => {
  for (const example of frontendExamples) {
    const partial = readFileSync(
      resolve(root, `apps/docs/content/_frontend/${example.partial}.mdx`),
      "utf8",
    );
    const rendered = withFrontendExample(`### ${example.symbol}\n\nContract.`, example.source);
    const includes = sourceIncludes(`${partial}\n${rendered}`);
    expect(includes.length, example.symbol).toBeGreaterThan(0);
    expect(partial, example.symbol).toMatch(/\/guides\/frontend|\/docs\/modules\/auth\/clients/);
    for (const { source, output } of includes) {
      const [path, region] = source.split("#");
      const original = sourceRegion(readFileSync(resolve(root, path!), "utf8"), region);
      expect(readFileSync(resolve(root, `apps/docs/content${output}`), "utf8")).toBe(original);
    }
    expect(rendered).toContain(`<include>/_frontend/${example.partial}.mdx</include>`);
  }
});
