/** Proves the portability check rejects runtime-specific code outside adapters and passes the repository. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  portabilityProblems,
  scanPortability,
  shrinkBaseline,
  type PortabilityBaseline,
} from "../../scripts/portability.ts";
import {
  isRuntimeAdapter,
  isWorkersAdapter,
  portabilityUses,
} from "../../scripts/portability-scan.ts";

const root = resolve(import.meta.dir, "../..");
const fixtureRoot = join(root, "tests/fixtures/portability");

test("a Bun call and a node: import outside an adapter fail and name their call sites", () => {
  const uses = scanPortability(fixtureRoot, ["packages/sample"]);
  expect(portabilityProblems(uses, {})).toEqual([
    'packages/sample/src/serve.ts:2 uses a node: module outside a runtime adapter: import { readFile } from "node:fs/promises";',
    "packages/sample/src/serve.ts:4 uses a Bun API outside a runtime adapter: Bun.serve",
  ]);
});

test("tooling packages may import node: modules but not Bun APIs", () => {
  const uses = portabilityUses(
    "packages/cli/src/a.ts",
    'import "node:fs";\nconst version = Bun.version;\n',
  );
  expect(uses.map(({ kind, line }) => [kind, line])).toEqual([
    ["node", 1],
    ["bun", 2],
  ]);
});

test("adapters, comments and strings are not call sites", () => {
  expect(isRuntimeAdapter("packages/relkit/src/runtime/bun/index.ts")).toBe(true);
  expect(isRuntimeAdapter("integrations/packages/redis/src/runtime/client.node.ts")).toBe(true);
  expect(isRuntimeAdapter("packages/relkit/src/runtime/current-runtime.ts")).toBe(false);
  // Workers adapters may import `node:*` through nodejs_compat, but they are not Bun or Node adapters.
  expect(isRuntimeAdapter("packages/relkit/src/runtime/workers/index.ts")).toBe(false);
  expect(isWorkersAdapter("packages/relkit/src/runtime/workers/index.ts")).toBe(true);
  expect(isWorkersAdapter("integrations/packages/redis/src/runtime/client.workers.ts")).toBe(true);
  expect(isWorkersAdapter("packages/relkit/src/runtime/current-runtime.ts")).toBe(false);
  expect(
    portabilityUses("a.ts", '// Bun.serve\nconst text = "Bun.file";\nconst s = `bun:sqlite`;\n'),
  ).toEqual([]);
  expect(
    portabilityUses("a.ts", 'type S = Bun.Server<undefined>;\nawait import("bun:sqlite");\n').map(
      ({ text }) => text,
    ),
  ).toEqual(["Bun.Server", 'import("bun:sqlite")']);
});

test("the baseline only shrinks: grown files fail, shrunk files ask for an update", () => {
  const uses = scanPortability(fixtureRoot, ["packages/sample"]);
  const exact: PortabilityBaseline = { "packages/sample/src/serve.ts": { bun: 1, node: 1 } };
  expect(portabilityProblems(uses, exact)).toEqual([]);
  expect(
    portabilityProblems(uses, { "packages/sample/src/serve.ts": { bun: 2, node: 1 } }),
  ).toEqual([
    "packages/sample/src/serve.ts has fewer bun call sites than recorded; run `bun run scripts/portability.ts --update-baseline`.",
  ]);
  expect(
    shrinkBaseline(uses, { "packages/sample/src/serve.ts": { bun: 3 }, "gone.ts": { node: 1 } }),
  ).toEqual({
    "packages/sample/src/serve.ts": { bun: 1 },
  });
});

test("the repository matches its baseline", () => {
  const baseline = JSON.parse(
    readFileSync(join(root, "scripts/portability-baseline.json"), "utf8"),
  ) as PortabilityBaseline;
  expect(portabilityProblems(scanPortability(root), baseline)).toEqual([]);
}, 60_000);
