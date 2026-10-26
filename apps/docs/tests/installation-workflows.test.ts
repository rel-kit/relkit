/** Checks that consumer evidence follows guide steps and rejects replacement manifests or workspace resolution. */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import manifest from "../../../package.json";
import docsManifest from "../package.json";
import {
  agentForbiddenPackages,
  assertGuideManifest,
  guideSteps,
  mergeGuideRepair,
  verifyConsumerIsolation,
} from "../scripts/installation-workflow-guidance.js";

const baseline = {
  name: "docs-consumer",
  private: true,
  scripts: { check: "relkit check" },
  dependencies: { "@relkit/app": "0.7.10" },
  devDependencies: { "@relkit/cli": "0.7.11" },
};
const selected = {
  dependencies: { "@relkit/drizzle": "0.7.10", "drizzle-orm": "1.0.0-rc.5-169397b" },
  devDependencies: { "drizzle-kit": "1.0.0-rc.5-ab785fc" },
};
const actual = {
  ...baseline,
  dependencies: { ...baseline.dependencies, ...selected.dependencies },
  devDependencies: { ...baseline.devDependencies, ...selected.devDependencies },
};
const owned: string[] = [];
afterEach(async () => {
  for (const path of owned.splice(0)) await rm(path, { recursive: true, force: true });
});

test("agent closure rejects DuckDB history packages while allowing its lightweight bridge", () => {
  for (const name of ["@duckdb/node-api", "@duckdb/node-bindings", "@relkit/inspector", "next"]) {
    expect(agentForbiddenPackages.test(name), name).toBe(true);
  }
  for (const name of ["@relkit/inspector-api", "@relkit/langchain", "langchain"]) {
    expect(agentForbiddenPackages.test(name), name).toBe(false);
  }
});

test("guide steps retain command/repair order and reject synthesized dependency blocks", () => {
  const source =
    '```sh\nbun add package\n```\n```json\n{"patchedDependencies":{"orm@1":"patches/orm.patch"}}\n```\n```sh\nbun install\n```';
  expect(guideSteps(source).map((step) => step.kind)).toEqual(["command", "repair", "command"]);
  expect(() => guideSteps('```json\n{"dependencies":{"@relkit/drizzle":"0.7.10"}}\n```')).toThrow();
  expect(() => guideSteps('```json\n{"scripts":{"check":"true"}}\n```')).toThrow();
});

test("selected repairs merge without replacing unrelated application settings", () => {
  const manifest = {
    ...baseline,
    overrides: { existing: "1" },
    pnpm: { overrides: { existing: "1" }, settings: true },
  };
  const result = mergeGuideRepair(manifest, {
    overrides: { selected: "2" },
    pnpm: { overrides: { selected: "2" } },
  });
  expect(result.overrides).toEqual({ existing: "1", selected: "2" });
  expect(result.pnpm).toEqual({ overrides: { existing: "1", selected: "2" }, settings: true });
  expect(result.scripts).toEqual(baseline.scripts);
});

test("a complete selected install passes without unrelated optional SDKs", () => {
  expect(() => assertGuideManifest(baseline, actual, selected)).not.toThrow();
});

test("missing selected SDKs and undeclared broad example dependencies are refused", () => {
  expect(() =>
    assertGuideManifest(
      baseline,
      { ...actual, dependencies: { ...baseline.dependencies, "@relkit/drizzle": "0.7.10" } },
      selected,
    ),
  ).toThrow();
  expect(() =>
    assertGuideManifest(
      baseline,
      { ...actual, dependencies: { ...actual.dependencies, "@relkit/langchain": "0.7.10" } },
      selected,
    ),
  ).toThrow();
});

test("whole-example replacement and incompatible authored declarations cannot establish proof", () => {
  expect(() =>
    assertGuideManifest(
      baseline,
      { ...actual, name: "commerce", scripts: { check: "true" } },
      selected,
    ),
  ).toThrow();
  expect(() =>
    assertGuideManifest(
      baseline,
      { ...actual, dependencies: { ...actual.dependencies, "@relkit/app": "0.0.5" } },
      selected,
    ),
  ).toThrow();
});

test("workspace node_modules links cannot establish an isolated installation", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-docs-isolation-control-"));
  owned.push(root);
  await mkdir(join(root, "consumer"));
  await mkdir(join(root, "workspace/node_modules"), { recursive: true });
  await writeFile(join(root, "consumer/package.json"), JSON.stringify(baseline));
  await symlink(join(root, "workspace/node_modules"), join(root, "consumer/node_modules"));
  await expect(
    Effect.runPromise(verifyConsumerIsolation(join(root, "consumer"), join(root, "workspace"))),
  ).rejects.toThrow();
});

test("packed journeys build before imports and block both CI and the local merge gate", async () => {
  const script = docsManifest.scripts["test:installations"];
  expect(script.indexOf("turbo run build")).toBeLessThan(
    script.indexOf("bun run scripts/check-installation-workflows.ts"),
  );
  expect(script).toContain("--cwd=../..");
  expect(manifest.scripts.prepush).toContain("bun --cwd=apps/docs run test:installations");
  const workflow = await readFile(
    join(import.meta.dir, "../../../.github/workflows/checks.yml"),
    "utf8",
  );
  expect(workflow).toContain("DOCS_INSTALLATIONS_RESULT: ${{ needs.docs-installations.result }}");
  expect(workflow).toContain('test "$DOCS_INSTALLATIONS_RESULT" = success');
});
