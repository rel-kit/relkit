/** Verifies finite native module graph evidence, canonical ownership and fail-closed gaps. */
import { dirname, join, relative } from "node:path";
import { symlinkSync, writeFileSync } from "node:fs";
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { consumerModulePaths } from "../consumer-module-paths.js";
import { probeConsumerDeclarations } from "../consumer-declaration-probe.js";
import type { ConsumerModuleEdge } from "../consumer-module-paths.types.js";
import { moduleGraphFixture } from "./consumer-module-paths.fixture.js";

test("empty or entry-omitting observations cannot claim complete evidence", () => {
  const fixture = moduleGraphFixture();
  try {
    for (const files of [[], fixture.modules])
      expect(() =>
        consumerModulePaths(
          fixture.entry,
          files,
          [],
          fixture.root,
          fixture.installation,
          "evaluation",
          "consumer",
        ),
      ).toThrow("Observed entry is missing");
  } finally {
    fixture.close();
  }
});

test("canonicalizes relative, symlink and owner paths before mapping observed edges", () => {
  const fixture = moduleGraphFixture(1);
  try {
    const first = fixture.modules[0];
    const instance = fixture.installation.instances[0];
    if (first === undefined || instance === undefined)
      throw new Error("Expected owned fixture module");
    const alias = join(fixture.root, "node_modules/fixture-alias");
    symlinkSync(dirname(first), alias, "dir");
    const target = relative(fixture.root, join(alias, "index.js"));
    const installation = {
      ...fixture.installation,
      instances: [{ ...instance, physicalPath: alias }],
    };
    const graph = consumerModulePaths(
      "entry.js",
      ["entry.js", target],
      [{ from: "entry.js", to: target }],
      fixture.root,
      installation,
      "evaluation",
      "consumer",
    );
    expect(graph.unreached).toEqual([]);
    expect(graph.paths).toContainEqual(
      expect.objectContaining({ packages: ["consumer", "fixture-0"] }),
    );
  } finally {
    fixture.close();
  }
});

test("records an observed entry's package even when it imports no other files", () => {
  const fixture = moduleGraphFixture(1);
  try {
    const entry = fixture.modules[0];
    if (entry === undefined) throw new Error("Expected owned package entry");
    const graph = consumerModulePaths(
      entry,
      [entry],
      [],
      fixture.root,
      fixture.installation,
      "declarations",
      "consumer",
    );
    expect(graph.paths).toContainEqual(
      expect.objectContaining({ packages: ["consumer", "fixture-0"] }),
    );
  } finally {
    fixture.close();
  }
});

test("retains each exact package route and fails closed before diamond paths exhaust memory", () => {
  const fixture = moduleGraphFixture(32);
  try {
    const installation = {
      ...fixture.installation,
      instances: fixture.installation.instances.map((instance, index) =>
        index === 31 ? { ...instance, name: "langchain" } : instance,
      ),
    };
    let previous = [fixture.entry];
    const edges: ConsumerModuleEdge[] = [];
    for (let layer = 0; layer < fixture.modules.length; layer += 2) {
      const next = fixture.modules.slice(layer, layer + 2);
      for (const from of previous) for (const to of next) edges.push({ from, to });
      previous = next;
    }
    expect(() =>
      consumerModulePaths(
        fixture.entry,
        [fixture.entry, ...fixture.modules],
        edges,
        fixture.root,
        installation,
        "evaluation",
        "consumer",
      ),
    ).toThrow("Module graph path budget exceeded");
  } finally {
    fixture.close();
  }
});

test("native declaration path exceptions stay expected collector failures", async () => {
  const fixture = moduleGraphFixture();
  try {
    const exit = await Effect.runPromiseExit(
      probeConsumerDeclarations(
        join(fixture.root, "absent"),
        "entry.ts",
        fixture.installation,
        "consumer",
      ),
    );
    expect(exit).toMatchObject({
      _tag: "Failure",
      cause: {
        reasons: [
          {
            _tag: "Fail",
            error: { _tag: "ConsumerInspectionError", operation: "probe.declarations" },
          },
        ],
      },
    });
  } finally {
    fixture.close();
  }
});

test("returning to a package through another file cannot hide its descendant route", () => {
  const fixture = moduleGraphFixture(3);
  try {
    const [first, middle, last] = fixture.modules;
    if (first === undefined || middle === undefined || last === undefined)
      throw new Error("Expected three owned fixture modules");
    const returning = join(dirname(first), "returning.js");
    const installation = {
      ...fixture.installation,
      instances: fixture.installation.instances.map((instance, index) =>
        index === 2 ? { ...instance, name: "langchain" } : instance,
      ),
    };
    writeFileSync(returning, "export const returning = true;");
    const edges = [
      { from: fixture.entry, to: first },
      { from: fixture.entry, to: last },
      { from: first, to: middle },
      { from: middle, to: returning },
      { from: returning, to: last },
      { from: middle, to: first },
    ];
    const graph = consumerModulePaths(
      fixture.entry,
      [fixture.entry, ...fixture.modules, returning],
      edges,
      fixture.root,
      installation,
      "evaluation",
      "consumer",
    );
    expect(graph.unreached).toEqual([]);
    expect(graph.paths).toContainEqual(
      expect.objectContaining({
        packages: ["consumer", "fixture-0", "fixture-1", "fixture-0", "langchain"],
      }),
    );
  } finally {
    fixture.close();
  }
});
