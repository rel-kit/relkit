/** Unselected SDK checks never consult unrelated invalid project installer metadata.
 * The real metadata reader remains substituted behind the same captured dependency source.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect, Exit, Layer } from "effect";
import { expect, it } from "vitest";
import {
  DependencySource,
  SelectedDependencies,
  SelectedDependenciesLayer,
} from "../src/dependency-preflight.service.js";
import { dependencyProjectManager } from "../src/dependency-project-manager.js";

const requirement = {
  package: "fixture-sdk",
  supportedRange: "1.0.0",
  installSection: "dependencies",
  capabilities: ["cache"],
  phases: ["runtime"],
} as const;

it.each([
  {
    name: "explicit empty requirements",
    capabilities: ["cache"],
    phase: "runtime",
    requirements: [],
  },
  {
    name: "unselected capability",
    capabilities: ["realtime"],
    phase: "runtime",
    requirements: [requirement],
  },
  {
    name: "unselected phase",
    capabilities: ["cache"],
    phase: "deploy",
    requirements: [requirement],
  },
] as const)("$name skips invalid installer metadata and package resolution", (selection) => {
  const root = mkdtempSync(join(tmpdir(), "relkit-dependency-noop-"));
  const calls: string[] = [];
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "consumer", packageManager: 42 }),
  );
  const source = Layer.succeed(DependencySource, {
    manager: (projectRoot) => {
      calls.push("manager");
      return dependencyProjectManager(projectRoot);
    },
    resolve: (name) =>
      Effect.sync(() => {
        calls.push(name);
        return null;
      }),
    satisfies: () => false,
  });
  try {
    const result = Effect.runSyncExit(
      Effect.gen(function* () {
        return yield* (yield* SelectedDependencies).check({
          projectRoot: root,
          adapter: "@fixture/adapter",
          ...selection,
        });
      }).pipe(Effect.provide(SelectedDependenciesLayer.pipe(Layer.provide(source)))),
    );
    expect(result).toEqual(Exit.succeed([]));
    expect(calls).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([
  { name: "empty adapter metadata", requirements: [] },
  { name: "unselected adapter metadata", requirements: [requirement] },
] as const)("$name skips invalid installer metadata after resolving the adapter", (metadata) => {
  const root = mkdtempSync(join(tmpdir(), "relkit-dependency-derived-noop-"));
  const calls: string[] = [];
  writeFileSync(join(root, "package.json"), JSON.stringify({ packageManager: "unsupported@1" }));
  const source = Layer.succeed(DependencySource, {
    manager: (projectRoot) => {
      calls.push("manager");
      return dependencyProjectManager(projectRoot);
    },
    resolve: (name) =>
      Effect.sync(() => {
        calls.push(name);
        return { name, version: "1.0.0", root, requirements: metadata.requirements };
      }),
    satisfies: () => false,
  });
  try {
    const result = Effect.runSyncExit(
      Effect.gen(function* () {
        return yield* (yield* SelectedDependencies).check({
          projectRoot: root,
          adapter: "@fixture/adapter",
          capabilities: ["unselected"],
          phase: "runtime",
        });
      }).pipe(Effect.provide(SelectedDependenciesLayer.pipe(Layer.provide(source)))),
    );
    expect(result).toEqual(Exit.succeed([]));
    expect(calls).toEqual(["@fixture/adapter"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
