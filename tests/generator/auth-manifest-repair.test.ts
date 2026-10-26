/** Selected native auth repairs retain each package manager's unrelated authored metadata. */
import { expect, test } from "bun:test";
import { mergeScaffoldManifest } from "../../packages/cli/src/scaffolding/plan-manifest.js";
import { SCAFFOLD_DEPENDENCIES } from "../../packages/create-relkit/src/scaffold-catalog.js";

function merge(value: object, auth = true) {
  return mergeScaffoldManifest(
    JSON.stringify(value),
    new Set(auth ? ["@relkit/better-auth", "better-auth", "@cloudflare/workers-types"] : []),
    new Map(),
  );
}

test("unselected auth adds no SDK, type package or override", () => {
  const source = {
    dependencies: { effect: "4.0.1" },
    overrides: { unrelated: "2.0.0" },
    pnpm: { settings: { preserve: true } },
  };
  const result = JSON.parse(merge(source, false).content);
  expect(result.dependencies).toEqual(source.dependencies);
  expect(result.devDependencies).toBeUndefined();
  expect(result.overrides).toEqual(source.overrides);
  expect(result.pnpm).toEqual(source.pnpm);
});

test("selected auth emits exact official fetch repair for Bun, npm and pnpm with native types", () => {
  const source = {
    overrides: { unrelated: { ".": "2.0.0", child: "3.0.0" } },
    pnpm: { settings: { preserve: true }, overrides: { other: "4.0.0" } },
  };
  const first = merge(source);
  const result = JSON.parse(first.content);
  expect(result.dependencies["better-auth"]).toBe("1.7.1");
  expect(result.devDependencies["@cloudflare/workers-types"]).toBe("4.20250121.0");
  expect(result.overrides).toEqual({ ...source.overrides, "@better-fetch/fetch": "1.3.2" });
  expect(result.pnpm).toEqual({
    ...source.pnpm,
    overrides: { other: "4.0.0", "@better-fetch/fetch": "1.3.2" },
  });
  expect(result.dependencies["better-auth"]).toBe(SCAFFOLD_DEPENDENCIES["better-auth"].version);
  const again = mergeScaffoldManifest(
    first.content,
    new Set(["@relkit/better-auth", "better-auth", "@cloudflare/workers-types"]),
    new Map(),
  );
  expect(again.content).toBe(first.content);
  expect(again.added).toEqual({});
});

for (const value of [
  { overrides: { "@better-fetch/fetch": "1.2.0" } },
  { pnpm: { overrides: { "@better-fetch/fetch": "1.2.0" } } },
])
  test("auth repair rejects conflicting manager overrides before publication", () => {
    expect(() => merge(value)).toThrow("conflicting @better-fetch/fetch override");
  });
