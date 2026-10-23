/** Verifies selected SDK manifest identity remains mutable after preparation. */
import { expect, it } from "@effect/vitest";
import { canonicalJson } from "@relkit/contracts";
import { DependencySource } from "@relkit/provider/internal/dependencies";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  SnapshotDependencies,
  snapshotDependenciesLive,
} from "../../src/dev-snapshot/snapshot-dependencies.service.js";
import { SnapshotFiles } from "../../src/dev-snapshot/snapshot-files.service.js";
import { verifySnapshotCurrentMembers } from "../../src/dev-snapshot/snapshot-current-members.js";
import { validationFixture } from "./validation-fixture.js";

it.effect("selected external SDK manifests are captured with an empty Bun inventory", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const root = "node_modules/inngest";
    fixture.bytes.set(
      `${fixture.root}/${root}/package.json`,
      canonicalJson({ name: "inngest", version: "4.20.0" }),
    );
    const source = Layer.succeed(DependencySource, {
      manager: () => Effect.succeed("bun"),
      resolve: (name: string, from: string) =>
        Effect.succeed({ name, version: "4.20.0", root: `${from}/${root}` }),
      satisfies: () => true,
    });
    const dependencies = yield* SnapshotDependencies.use((service) =>
      service.capture(
        fixture.root,
        Buffer.from(canonicalJson({ inputs: {} })),
        undefined,
        undefined,
        { inngest: "4.20.0" },
      ),
    ).pipe(
      Effect.provide(
        snapshotDependenciesLive.pipe(Layer.provide(Layer.merge(fixture.layer, source))),
      ),
    );
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0]).toMatchObject({
      name: "inngest",
      version: "4.20.0",
      root,
      members: [{ path: "package.json" }],
    });
  }),
);

it.effect("compatible SDK version changes invalidate preparation without a lockfile change", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const root = "node_modules/inngest";
    const manifest = `${fixture.root}/${root}/package.json`;
    fixture.bytes.set(manifest, canonicalJson({ name: "inngest", version: "4.20.0" }));
    fixture.bytes.set(`${fixture.root}/${root}/index.js`, "selected SDK");
    const dependencies = yield* SnapshotDependencies.use((service) =>
      service.capture(
        fixture.root,
        Buffer.from(canonicalJson({ inputs: { [`${root}/index.js`]: { bytes: 12 } } })),
      ),
    ).pipe(Effect.provide(snapshotDependenciesLive.pipe(Layer.provide(fixture.layer))));
    const files = yield* SnapshotFiles.pipe(Effect.provide(fixture.layer));
    const receipt = { ...fixture.receipt, dependencies };
    expect(
      Exit.isSuccess(
        yield* Effect.exit(verifySnapshotCurrentMembers(files, fixture.root, receipt)),
      ),
    ).toBe(true);
    fixture.bytes.set(manifest, canonicalJson({ name: "inngest", version: "4.20.1" }));
    const changed = yield* Effect.exit(verifySnapshotCurrentMembers(files, fixture.root, receipt));
    expect(Exit.isFailure(changed)).toBe(true);
    if (Exit.isFailure(changed))
      expect(Cause.squash(changed.cause)).toMatchObject({ operation: "member.digest" });
    fixture.bytes.delete(manifest);
    expect(
      Exit.isFailure(
        yield* Effect.exit(verifySnapshotCurrentMembers(files, fixture.root, receipt)),
      ),
    ).toBe(true);
  }),
);
