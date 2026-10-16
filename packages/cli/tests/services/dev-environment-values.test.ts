/**
 * Checks the resolver's native Bun parsing, precedence and retained key ownership.
 * Custom startup environments isolate each test without editing process.env;
 * the provided Layer owns every helper process and temporary file directory.
 */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { cliPromise } from "../../src/cli-errors.js";
import { CliDevEnvironment } from "../../src/services/dev-environment.service.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";
import { processLayer } from "../../src/services/process.service.js";
import { developmentEnvironmentFiles } from "../../src/commands/dev-environment-files.js";
import type { DevelopmentEnvironment } from "../../src/services/dev-environment.types.js";

/**
 * Supplies native adapters and an isolated startup environment to the real service.
 * @param inherited - Controlled initial values, including preloaded dotenv sentinels.
 * @returns A fresh resolver Layer whose native processes join each resolution.
 */
function environmentLayer(inherited: DevelopmentEnvironment) {
  return Layer.effect(CliDevEnvironment, CliDevEnvironment.make(inherited)).pipe(
    Layer.provide(Layer.merge(fileSystemLayer, processLayer)),
  );
}

const fixture = Effect.acquireRelease(
  cliPromise("test.environment.root", () => mkdtemp(join(tmpdir(), "relkit-env-values-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

/**
 * Replaces one fixture dotenv file through the same native filesystem boundary.
 * @param root - Exclusive fixture root.
 * @param name - Standard dotenv filename.
 * @param text - Synthetic nonsecret test values.
 * @returns Joined replacement before the next resolution.
 */
const put = (root: string, name: string, text: string) =>
  cliPromise("test.environment.write", () => writeFile(join(root, name), text));

test("refreshes startup file values, expansion, empty values, fallback and deletion", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const service = yield* CliDevEnvironment;
        const parentValue = process.env.VALUE;
        yield* put(root, ".env", "VALUE=base\nEMPTY=\nBASE=prefix\n");
        yield* put(root, ".env.development", "VALUE=mode\n");
        yield* put(
          root,
          ".env.local",
          'VALUE=local\nLOCAL_BASE=prefix\nEXPANDED=$LOCAL_BASE/suffix\nQUOTED="two words"\nMULTILINE=`first\nsecond`\nESCAPED=hello\\$LOCAL_BASE\nINDIRECT=$UNRELATED\n',
        );
        yield* put(root, ".env.example", "EXAMPLE_ONLY=must-not-load\n");
        const first = yield* service.resolve(root);
        expect(first.VALUE).toBe("local");
        expect(first.EXPANDED).toBe("prefix/suffix");
        expect(first.QUOTED).toBe("two words");
        expect(first.MULTILINE).toBe("first\nsecond");
        expect(first.ESCAPED).toBe("hello$LOCAL_BASE");
        expect(first.INDIRECT).toBe("inherited");
        expect(first.EMPTY).toBe("");
        expect(first.EXAMPLE_ONLY).toBeUndefined();
        expect(first.UNRELATED).toBe("inherited");
        yield* put(root, ".env.local", "VALUE=changed\n");
        expect((yield* service.resolve(root)).VALUE).toBe("changed");
        yield* cliPromise("test.environment.remove-local", () => rm(join(root, ".env.local")));
        expect((yield* service.resolve(root)).VALUE).toBe("mode");
        yield* put(root, ".env.development", "");
        expect((yield* service.resolve(root)).VALUE).toBe("base");
        yield* put(root, ".env", "");
        const removed = yield* service.resolve(root);
        expect(removed.VALUE).toBeUndefined();
        expect(Object.hasOwn(removed, "VALUE")).toBe(true);
        expect(removed.UNRELATED).toBe("inherited");
        expect(process.env.VALUE === parentValue).toBe(true);
      }),
    ).pipe(
      Effect.provide(
        environmentLayer({ NODE_ENV: "development", VALUE: "stale", UNRELATED: "inherited" }),
      ),
    ),
  ));

test("test mode excludes .env.local and isolates concurrent project roots", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const first = yield* fixture;
        const second = yield* fixture;
        const service = yield* CliDevEnvironment;
        yield* put(first, ".env", "VALUE=first\n");
        yield* put(first, ".env.local", "VALUE=incorrect\n");
        yield* put(second, ".env.test", "VALUE=second\n");
        const results = yield* Effect.all([service.resolve(first), service.resolve(second)], {
          concurrency: 2,
        });
        expect(results.map((result) => result.VALUE)).toEqual(["first", "second"]);
      }),
    ).pipe(Effect.provide(environmentLayer({ NODE_ENV: "test" }))),
  ));

test("selects Bun's active standard file order", () => {
  expect(developmentEnvironmentFiles(undefined)).toEqual([
    ".env",
    ".env.development",
    ".env.local",
    ".env.development.local",
  ]);
  expect(developmentEnvironmentFiles("production")).toEqual([
    ".env",
    ".env.production",
    ".env.local",
    ".env.production.local",
  ]);
  expect(developmentEnvironmentFiles("test")).toEqual([".env", ".env.test", ".env.test.local"]);
});

test("custom NODE_ENV follows Bun's development dotenv fallback", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        yield* put(root, ".env.development", "VALUE=development\n");
        const service = yield* CliDevEnvironment;
        expect((yield* service.resolve(root)).VALUE).toBe("development");
      }),
    ).pipe(Effect.provide(environmentLayer({ NODE_ENV: "staging" }))),
  ));

test("production files override base values while local retains highest precedence", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const service = yield* CliDevEnvironment;
        yield* put(root, ".env", "VALUE=base\n");
        yield* put(root, ".env.development", "VALUE=inactive\n");
        yield* put(root, ".env.production", "VALUE=production\n");
        yield* put(root, ".env.local", "VALUE=local\n");
        expect((yield* service.resolve(root)).VALUE).toBe("local");
        yield* cliPromise("test.environment.remove-local", () => rm(join(root, ".env.local")));
        expect((yield* service.resolve(root)).VALUE).toBe("production");
      }),
    ).pipe(Effect.provide(environmentLayer({ NODE_ENV: "production" }))),
  ));

for (const mode of ["development", "production", "test"] as const)
  test(`${mode} local files override local values and refresh after removal`, () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* fixture;
          const service = yield* CliDevEnvironment;
          yield* put(root, `.env.${mode}`, "VALUE=mode\n");
          yield* put(root, ".env.local", "VALUE=local\n");
          yield* put(root, `.env.${mode}.local`, "VALUE=mode-local\n");
          expect((yield* service.resolve(root)).VALUE).toBe("mode-local");
          yield* cliPromise("test.environment.remove-mode-local", () =>
            rm(join(root, `.env.${mode}.local`)),
          );
          expect((yield* service.resolve(root)).VALUE).toBe(mode === "test" ? "mode" : "local");
        }),
      ).pipe(Effect.provide(environmentLayer({ NODE_ENV: mode }))),
    ));
