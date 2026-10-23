/** Verifies externalized SDK selection is freshly resolved independently of bundle members. */
import { expect, it } from "@effect/vitest";
import { canonicalJson } from "@relkit/contracts";
import { Cause, Effect, Exit } from "effect";
import { verifySnapshotSelectedDependencies } from "../../src/dev-snapshot/snapshot-selected-dependencies.js";
import { SnapshotFiles } from "../../src/dev-snapshot/snapshot-files.service.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { validationFixture } from "./validation-fixture.js";
import { selectedManifestPaths } from "../../src/dev-snapshot/snapshot-dependency-paths.js";

it.effect("isolated preparation retains its fixed HTTP producer owner", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const manifest = canonicalJson({ dependencies: { "@relkit/runtime-hono": "0.7.10" } });
    fixture.bytes.set(`${fixture.capsuleRoot}/package.json`, manifest);
    const receipt = {
      ...fixture.receipt,
      artifacts: [
        ...fixture.receipt.artifacts,
        {
          path: "package.json",
          bytes: Buffer.byteLength(manifest),
          hash: snapshotDigest(manifest),
        },
      ],
    };
    const source = {
      manager: () => Effect.succeed("bun" as const),
      resolve: (name: string, from: string) =>
        Effect.succeed(
          from === fixture.root
            ? null
            : { name, root: "/producer/runtime-hono", version: "0.7.10" },
        ),
      satisfies: () => true,
    };
    expect(
      yield* selectedManifestPaths(source, fixture.root, { "@relkit/runtime-hono": "0.7.10" }),
    ).toEqual(["/producer/runtime-hono/package.json"]);
    const files = yield* SnapshotFiles.pipe(Effect.provide(fixture.layer));
    yield* verifySnapshotSelectedDependencies(
      source,
      files,
      fixture.root,
      fixture.capsuleRoot,
      receipt,
    );
  }),
);

it.effect("removed and compatibly upgraded external SDKs reject prepared activation", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const manifest = canonicalJson({ dependencies: { inngest: "4.20.0" } });
    fixture.bytes.set(`${fixture.capsuleRoot}/package.json`, manifest);
    const receipt = {
      ...fixture.receipt,
      artifacts: [
        ...fixture.receipt.artifacts,
        {
          path: "package.json",
          bytes: Buffer.byteLength(manifest),
          hash: snapshotDigest(manifest),
        },
      ],
    };
    const files = yield* SnapshotFiles.pipe(Effect.provide(fixture.layer));
    for (const version of ["4.20.0", "4.20.1", undefined]) {
      const source = {
        manager: () => Effect.succeed("bun" as const),
        resolve: (name: string, root: string) =>
          Effect.succeed(
            version === undefined ? null : { name, version, root: `${root}/node_modules/${name}` },
          ),
        satisfies: () => true,
      };
      const result = yield* Effect.exit(
        verifySnapshotSelectedDependencies(
          source,
          files,
          fixture.root,
          fixture.capsuleRoot,
          receipt,
        ),
      );
      expect(Exit.isSuccess(result)).toBe(version === "4.20.0");
      if (Exit.isFailure(result))
        expect(Cause.squash(result.cause)).toMatchObject({
          reason: "stale",
          operation: "selection.identity",
        });
    }
  }),
);

it.effect("an unselected SDK needs no installed metadata authority", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const files = yield* SnapshotFiles.pipe(Effect.provide(fixture.layer));
    expect(
      Exit.isSuccess(
        yield* Effect.exit(
          verifySnapshotSelectedDependencies(
            undefined,
            files,
            fixture.root,
            fixture.capsuleRoot,
            fixture.receipt,
          ),
        ),
      ),
    ).toBe(true);
  }),
);
