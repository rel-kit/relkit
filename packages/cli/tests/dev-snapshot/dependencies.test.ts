/**
 * Verifies executable closure capture with deterministic injected file authority.
 * Installed manifests and consumed bytes participate separately; native paths
 * cannot escape containment or turn undecoded bundle metadata into import authority.
 */
import { expect, it } from "@effect/vitest";
import { canonicalJson } from "@relkit/contracts";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  SnapshotDependencies,
  snapshotDependenciesLive,
} from "../../src/dev-snapshot/snapshot-dependencies.service.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { validationFixture } from "./validation-fixture.js";

/**
 * Runs capture through the real service and its replaceable file Layer.
 * @param fixture - Explicit mutable bytes used to model installation changes.
 * @param paths - Complete consumed native path list from a hypothetical Bun build.
 * @returns Full capture Exit, preserving expected failures and Cause channels.
 */
function capture(fixture: ReturnType<typeof validationFixture>, paths: readonly string[]) {
  const source = canonicalJson({
    inputs: Object.fromEntries(paths.map((path) => [path, { bytes: 10 }])),
  });
  return Effect.exit(
    SnapshotDependencies.use((service) => service.capture(fixture.root, Buffer.from(source))).pipe(
      Effect.provide(snapshotDependenciesLive.pipe(Layer.provide(fixture.layer))),
    ),
  );
}

/**
 * Installs two same-named packages with different nested resolutions.
 * @returns Explicit file authority for independent byte/manifest mutation.
 */
function fixturePackages() {
  const fixture = validationFixture();
  for (const [root, version] of [
    ["node_modules/runtime", "1.0.0"],
    ["node_modules/runtime/node_modules/runtime", "2.0.0"],
  ]) {
    fixture.bytes.set(
      `${fixture.root}/${root}/package.json`,
      canonicalJson({ name: "runtime", version }),
    );
    fixture.bytes.set(`${fixture.root}/${root}/index.js`, "dependency");
  }
  return fixture;
}

it.effect("includes manifests and preserves distinct nested installed resolutions", () =>
  Effect.gen(function* () {
    const fixture = fixturePackages();
    const exit = yield* capture(fixture, [
      "src/app.ts",
      "node_modules/runtime/index.js",
      "node_modules/runtime/node_modules/runtime/index.js",
    ]);
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.map((entry) => entry.version)).toEqual(["1.0.0", "2.0.0"]);
      expect(exit.value[0]?.members.map((entry) => entry.path)).toEqual([
        "index.js",
        "package.json",
      ]);
      expect(exit.value[0]?.members[0]?.hash).toBe(snapshotDigest("dependency"));
    }
  }),
);

it.effect("same-version executable replacement changes the captured content identity", () =>
  Effect.gen(function* () {
    const fixture = fixturePackages();
    const first = yield* capture(fixture, ["node_modules/runtime/index.js"]);
    fixture.bytes.set(`${fixture.root}/node_modules/runtime/index.js`, "replacement");
    const second = yield* capture(fixture, ["node_modules/runtime/index.js"]);
    expect(Exit.isSuccess(first) && Exit.isSuccess(second)).toBe(true);
    if (Exit.isSuccess(first) && Exit.isSuccess(second)) {
      expect(first.value[0]?.version).toBe(second.value[0]?.version);
      expect(first.value[0]?.members).not.toEqual(second.value[0]?.members);
    }
  }),
);

it.effect("normalizes contained absolute paths and rejects escaped paths before reading", () =>
  Effect.gen(function* () {
    const fixture = fixturePackages();
    expect(
      Exit.isSuccess(yield* capture(fixture, [`${fixture.root}/node_modules/runtime/index.js`])),
    ).toBe(true);
    for (const path of [
      "../outside.js",
      "/elsewhere/node_modules/runtime/index.js",
      "node_modules/runtime",
      ".env",
      "src/.env.private",
      "node_modules/runtime/.env.production",
    ]) {
      const exit = yield* capture(fixture, [path]);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ reason: "ineligible" });
    }
  }),
);
