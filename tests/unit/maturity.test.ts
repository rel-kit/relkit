/** Keeps package tiers, `@experimental` tags and docs Labs badges in line with the maturity table. */
import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  MATURITY_FEATURES,
  maturityProblems,
  readPackageTiers,
  type MaturityFeature,
} from "../../scripts/maturity.ts";

const root = resolve(import.meta.dir, "../..");
const fixture = await mkdtemp(join(tmpdir(), "relkit-maturity-"));

afterAll(() => rm(fixture, { recursive: true, force: true }));

async function put(path: string, text: string): Promise<void> {
  await mkdir(dirname(join(fixture, path)), { recursive: true });
  await writeFile(join(fixture, path), text);
}

const manifest = (name: string, maturity?: string) =>
  JSON.stringify({
    name,
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    ...(maturity ? { relkit: { maturity } } : {}),
  });

test("the repository agrees with the maturity table", () => {
  expect(maturityProblems(root)).toEqual([]);
});

test("every published package declares a tier", () => {
  const packages = readPackageTiers(root);
  expect(packages.length).toBeGreaterThan(50);
  expect(packages.filter(({ tier }) => tier !== "core" && tier !== "labs")).toEqual([]);
});

test("the initial assignment puts the plan's Labs features in Labs", () => {
  const tierOf = new Map(MATURITY_FEATURES.map(({ name, tier }) => [name, tier]));
  for (const name of [
    "Realtime",
    "AWS hosting",
    "Inngest job adapter",
    "Trigger.dev job adapter",
    "Effect MQ job adapter",
    "Agent adapters (LangChain and DeepAgents)",
    "Graph workflows",
  ])
    expect(tierOf.get(name)).toBe("labs");
  expect(tierOf.get("Built-in telemetry")).toBe("core");
});

test("a fixture with a missing tag, a stray tag, a missing tier and stale badges fails", async () => {
  await put("packages/labs-kit/package.json", manifest("@fixture/labs-kit", "labs"));
  await put(
    "packages/labs-kit/src/index.ts",
    [
      "/** Tagged. @experimental */",
      "export const tagged = 1;",
      "/** Missing its tag. */",
      "export function untagged(): void {}",
      'export { helper } from "./helper.js";',
    ].join("\n"),
  );
  await put("packages/labs-kit/src/helper.ts", "export type helper = string;\n");
  await put("packages/core-kit/package.json", manifest("@fixture/core-kit", "core"));
  await put(
    "packages/core-kit/src/index.ts",
    "/**\n * Stable.\n * @experimental\n */\nexport const stable = 1;\n",
  );
  await put("packages/no-tier/package.json", manifest("@fixture/no-tier"));
  await put("packages/no-tier/src/index.ts", "export const value = 1;\n");
  await put("apps/docs/content/docs/labs-kit.mdx", "---\ntitle: Labs kit\n---\n");
  await put("apps/docs/content/docs/core-kit/index.mdx", "---\ntitle: Core kit\nlabs: true\n---\n");
  const features: MaturityFeature[] = [
    { name: "Labs kit", tier: "labs", packages: ["@fixture/labs-kit"], docs: ["/docs/labs-kit"] },
    { name: "Core kit", tier: "core", packages: ["@fixture/core-kit"], docs: ["/docs/core-kit"] },
  ];
  expect(maturityProblems(fixture, features)).toEqual([
    '@fixture/no-tier: set "relkit.maturity" to "core" or "labs" in its package.json',
    "@fixture/no-tier is not in the maturity table",
    "@fixture/labs-kit export untagged has no @experimental tag (packages/labs-kit/src/index.ts:4)",
    "@fixture/labs-kit export helper has no @experimental tag (packages/labs-kit/src/helper.ts:1)",
    "packages/core-kit/src/index.ts:3: Core packages must not tag declarations @experimental",
    '/docs/labs-kit needs "labs: true" (Labs kit)',
    "/docs/core-kit is flagged Labs but documents Core feature Core kit",
  ]);
});

test("the pull request template and CONTRIBUTING record the feature freeze", async () => {
  const template = await readFile(join(root, ".github/pull_request_template.md"), "utf8");
  expect(template).toMatch(/new feature area[^\n]*approved OpenSpec change/iu);
  const contributing = await readFile(join(root, "CONTRIBUTING.md"), "utf8");
  expect(contributing).toContain("## Feature freeze until 1.0");
  expect(contributing).toContain("https://relkit.dev/docs/maturity");
});
