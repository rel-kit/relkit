import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CompilerPackageSource,
  CompilerPackageSourceLive,
} from "../src/integration-package-source.js";
import { loadPackageEffect } from "../src/integration-package-loader.js";
import {
  runtimePackageEffect,
  runtimeRegistrationsEffect,
} from "../src/integration-package-runtime.js";
import {
  assertAuthoringImportEffect,
  catalogTargetEffect,
} from "../src/integration-package-metadata.js";
import { resolveIntegrationPackageRoleEffect } from "../src/integration-package-resolution.js";

const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-package-metadata-"))),
  (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
);

describe("package validation ownership", () => {
  it.effect(
    "decodes JSON object roots, retains extra fields, and contextualizes native failures",
    () =>
      Effect.gen(function* () {
        const root = yield* directory;
        const path = join(root, "package.json");
        const reader = yield* CompilerPackageSource;
        for (const value of [null, [], true, 7, "package"]) {
          yield* Effect.promise(() => writeFile(path, JSON.stringify(value)));
          const failure = yield* Effect.flip(reader.readManifest(path));
          expect(failure._tag).toBe("IntegrationPackageValidationError");
          expect(failure.cause).toBeInstanceOf(TypeError);
          expect(String(failure.cause)).toContain(path);
        }
        const manifest = { name: "example", unrelated: { retained: true } };
        yield* Effect.promise(() => writeFile(path, JSON.stringify(manifest)));
        expect(yield* reader.readManifest(path)).toEqual(manifest);
        yield* Effect.promise(() => writeFile(path, "{"));
        expect(yield* Effect.flip(reader.readManifest(path))).toMatchObject({
          _tag: "IntegrationPackageIoError",
          operation: "read-manifest",
          path,
          cause: expect.any(SyntaxError),
        });
        expect(yield* Effect.flip(reader.readManifest(join(root, "absent.json")))).toMatchObject({
          _tag: "IntegrationPackageIoError",
          cause: { code: "ENOENT" },
        });
      }).pipe(Effect.provide(CompilerPackageSourceLive)),
  );

  it.effect("exposes standalone metadata and ownership rejection as failures", () =>
    Effect.gen(function* () {
      const invalid = { relkit: { integration: { id: "bad id", exports: { runtime: {} } } } };
      expect(
        (yield* Effect.flip(runtimePackageEffect({ root: "/package", manifest: invalid })))._tag,
      ).toBe("IntegrationPackageValidationError");
      for (const value of [
        null,
        [],
        [{ capability: "cache", adapterId: "redis", protocolVersion: 2 }],
      ]) {
        expect((yield* Effect.flip(runtimeRegistrationsEffect("redis", value)))._tag).toBe(
          "IntegrationPackageValidationError",
        );
      }
      const entry = { capability: "cache", adapterId: "redis", protocolVersion: 1 };
      expect(
        (yield* Effect.flip(runtimeRegistrationsEffect("redis", [entry, entry]))).cause,
      ).toEqual(new TypeError('Integration "redis" has duplicate runtime registrations.'));
      expect(
        (yield* Effect.flip(
          catalogTargetEffect({ name: "catalog", relkit: { catalog: { ".": 7 } } }, "catalog"),
        ))._tag,
      ).toBe("IntegrationPackageValidationError");
      expect(
        (yield* Effect.flip(
          assertAuthoringImportEffect(
            { name: "example", relkit: { integration: { exports: { authoring: "." } } } },
            "example/private",
          ),
        ))._tag,
      ).toBe("IntegrationPackageValidationError");
      expect((yield* Effect.flip(loadPackageEffect("./relative", "/project")))._tag).toBe(
        "IntegrationPackageValidationError",
      );
      expect((yield* Effect.flip(loadPackageEffect("missing", "/project")))._tag).toBe(
        "IntegrationPackageValidationError",
      );
      expect(
        (yield* Effect.flip(
          resolveIntegrationPackageRoleEffect({
            projectRoot: "/project",
            packageName: "example",
            integrationId: "example",
            role: "host",
          }),
        ))._tag,
      ).toBe("IntegrationPackageValidationError");
    }).pipe(
      Effect.provideService(CompilerPackageSource, {
        resolve: () => Effect.succeed("/package/index.ts"),
        canonical: (path) => Effect.succeed(path),
        exists: () => Effect.succeed(true),
        readManifest: () => Effect.succeed({ name: "example", version: "1" }),
      }),
    ),
  );

  it.effect("retains injected reader defects without translating them", () =>
    Effect.gen(function* () {
      const defect = new Error("reader bug");
      const exit = yield* Effect.exit(
        loadPackageEffect("example", "/project").pipe(
          Effect.provideService(CompilerPackageSource, {
            resolve: () => Effect.succeed("/package/index.ts"),
            canonical: (path) => Effect.succeed(path),
            exists: () => Effect.succeed(true),
            readManifest: () => Effect.die(defect),
          }),
        ),
      );
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(defect);
    }),
  );
});
