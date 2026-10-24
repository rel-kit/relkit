/**
 * Checks selected requirements through the same captured resolver contract used
 * by production. Missing optional capabilities never resolve; each invocation
 * retains its project/adapter roots and failures remain typed without installation.
 */
import { describe, expect, it } from "vitest";
import { Effect, Exit, Layer } from "effect";
import {
  DependencySource,
  SelectedDependencies,
  SelectedDependenciesLayer,
} from "../src/dependency-preflight.service.js";
import type {
  DependencySelection,
  InstalledPackageIdentity,
} from "../src/dependency-preflight.types.js";

const requirement = {
  package: "redis",
  supportedRange: "5.0.0",
  installSection: "dependencies",
  capabilities: ["cache"],
  phases: ["check", "build", "runtime"],
} as const;
const selection: DependencySelection = {
  projectRoot: "/consumer",
  adapter: "@relkit/redis",
  capabilities: ["cache"],
  phase: "runtime",
  requirements: [requirement],
  manager: "pnpm",
  source: "src/platform/cache.ts",
};

/**
 * Supplies a deterministic package source while retaining domain validation.
 * @param entries - Installed identities available to this isolated invocation.
 * @param calls - Borrowed log of package/root resolution attempts.
 * @returns A ready validator Layer with no filesystem/network/install capability.
 */
function testLayer(entries: readonly InstalledPackageIdentity[], calls: string[]) {
  return SelectedDependenciesLayer.pipe(
    Layer.provide(
      Layer.succeed(DependencySource, {
        manager: () => Effect.succeed("bun"),
        resolve: (name, from) =>
          Effect.sync(() => {
            calls.push(`${name}:${from}`);
            return entries.find((entry) => entry.name === name) ?? null;
          }),
        satisfies: (version, range) => version === range,
      }),
    ),
  );
}

/**
 * Runs through service acquisition rather than testing a separate helper path.
 * @param input - Selection whose readiness is checked.
 * @param entries - Packages visible to the substituted resolver.
 * @param calls - Resolution log proving narrow capability and root selection.
 * @returns The complete exit so failures are inspected without fabricated success.
 */
function check(
  input: DependencySelection,
  entries: readonly InstalledPackageIdentity[],
  calls: string[],
) {
  return Effect.runSyncExit(
    Effect.gen(function* () {
      return yield* (yield* SelectedDependencies).check(input);
    }).pipe(Effect.provide(testLayer(entries, calls))),
  );
}

const adapter = {
  name: "@relkit/redis",
  version: "0.7.10",
  root: "/consumer/node_modules/.isolated/redis",
};

describe("selected dependency preflight", () => {
  it("unused capability and deploy-only requirements do not resolve", () => {
    const calls: string[] = [];
    expect(Exit.isSuccess(check({ ...selection, capabilities: ["realtime"] }, [], calls))).toBe(
      true,
    );
    expect(Exit.isSuccess(check({ ...selection, phase: "deploy" }, [], calls))).toBe(true);
    expect(calls).toEqual([]);
  });

  it("resolves adapters from consumers and peers from selected adapters", () => {
    const calls: string[] = [];
    expect(
      Exit.isSuccess(
        check(selection, [adapter, { name: "redis", version: "5.0.0", root: "/sdk" }], calls),
      ),
    ).toBe(true);
    expect(calls).toEqual(["@relkit/redis:/consumer", `redis:${adapter.root}`]);
  });

  it("aggregates missing selected SDKs with project manager guidance", () => {
    const result = Effect.runSync(
      Effect.gen(function* () {
        return yield* (yield* SelectedDependencies)
          .check(selection)
          .pipe(
            Effect.catchTag("SelectedDependencyFailure", (error) =>
              Effect.succeed(error.diagnostics),
            ),
          );
      }).pipe(Effect.provide(testLayer([adapter], []))),
    );
    expect(result).toEqual([
      {
        code: "RELKIT_DEPENDENCY_MISSING",
        package: "redis",
        supportedRange: "5.0.0",
        installedVersion: null,
        capabilities: ["cache"],
        source: "src/platform/cache.ts",
        install: "pnpm add redis@5.0.0",
      },
    ]);
  });
});

describe("selected dependency correction guidance", () => {
  it("revalidates a removed SDK and reports incompatible installed versions", () => {
    expect(Exit.isFailure(check(selection, [adapter], []))).toBe(true);
    expect(
      Exit.isFailure(
        check(selection, [adapter, { name: "redis", version: "4.0.0", root: "/sdk" }], []),
      ),
    ).toBe(true);
  });

  it.each(["bun", "npm", "pnpm"] as const)(
    "%s keeps type-only corrections in devDependencies",
    (manager) => {
      const result = Effect.runSync(
        Effect.gen(function* () {
          return yield* (yield* SelectedDependencies)
            .check({
              ...selection,
              manager,
              requirements: [
                {
                  ...requirement,
                  installSection: "devDependencies",
                  supportedRange: ">=5.0.0 <6.0.0",
                },
              ],
            })
            .pipe(
              Effect.catchTag("SelectedDependencyFailure", (error) =>
                Effect.succeed(error.diagnostics),
              ),
            );
        }).pipe(Effect.provide(testLayer([adapter], []))),
      );
      expect(result).toMatchObject([
        {
          install: `${manager} ${manager === "npm" ? "install" : "add"} -D 'redis@>=5.0.0 <6.0.0'`,
        },
      ]);
    },
  );
});
