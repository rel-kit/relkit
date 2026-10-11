/**
 * Exercises real Bun bundles with isolated missing, hoisted and nested optional
 * peers. Test-owned Effect scopes join subprocesses and fixture cleanup; required
 * imports must still fail and remove the helper's temporary module link.
 */
import { expect, test } from "bun:test";
import { lstat, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { processLayer } from "./src/services/process.service.js";
import { ownedNativePromise } from "./src/services/owned-promise.js";
import { createBuildSupportFixture, runFixtureBun } from "./build-support-fixture.js";

for (const development of [true, false]) {
  test(`bundles without optional DeepAgents in ${development ? "development" : "production"}`, () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* createBuildSupportFixture();
          const built = yield* fixture.build(development);
          expect(built.exitCode, built.stderr + built.stdout).toBe(0);
          yield* assertModuleLinkAbsent(fixture.server);
          const started = yield* runFixtureBun([join(fixture.server, "index.js")], fixture.root);
          expect({ code: started.exitCode, output: started.stdout + started.stderr }).toEqual({
            code: 0,
            output: "ready\n",
          });
          const missing = yield* runFixtureBun(
            [join(fixture.server, "index.js"), "invoke"],
            fixture.root,
          );
          expect({ code: missing.exitCode, output: missing.stdout + missing.stderr }).toEqual({
            code: 0,
            output: "optional dependency unavailable\n",
          });
        }),
      ).pipe(Effect.provide(processLayer)),
    ));
}

for (const nested of [false, true]) {
  test(`bundles ${nested ? "nested" : "hoisted"} DeepAgents into a standalone production server`, () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* createBuildSupportFixture();
          const dependency = nested
            ? join(fixture.modules, "@relkit/agents/node_modules/deepagents")
            : join(fixture.modules, "deepagents");
          yield* ownedNativePromise("test.peer", async (signal) => {
            await mkdir(dependency, { recursive: true });
            await writeFile(
              join(dependency, "package.json"),
              JSON.stringify({ name: "deepagents", type: "module", exports: "./index.js" }),
              { signal },
            );
            await writeFile(
              join(dependency, "index.js"),
              'export const value = "native agent ready";',
              { signal },
            );
          });
          const built = yield* fixture.build(false);
          expect(built.exitCode, built.stderr + built.stdout).toBe(0);
          yield* ownedNativePromise("test.hideModules", () =>
            rm(fixture.modules, { recursive: true, force: true }),
          );
          const started = yield* runFixtureBun(
            [join(fixture.server, "index.js"), "invoke"],
            fixture.root,
          );
          expect({ code: started.exitCode, output: started.stdout + started.stderr }).toEqual({
            code: 0,
            output: "native agent ready\n",
          });
        }),
      ).pipe(Effect.provide(processLayer)),
    ));
}

test("missing required imports still fail bundling and remove the temporary module link", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* createBuildSupportFixture();
        yield* ownedNativePromise("test.requiredImport", (signal) =>
          writeFile(join(fixture.server, "index.ts"), 'import "missing-required-package";', {
            signal,
          }),
        );
        const built = yield* fixture.build(false);
        expect(built.exitCode).not.toBe(0);
        expect(built.stderr + built.stdout).toContain(
          'Could not resolve: "missing-required-package"',
        );
        yield* assertModuleLinkAbsent(fixture.server);
      }),
    ).pipe(Effect.provide(processLayer)),
  ));

test("preparation seals lazy chunks that run after relocation without installed modules", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* createBuildSupportFixture();
        yield* ownedNativePromise("test.lazyInput", async (signal) => {
          await symlink(fixture.modules, join(fixture.root, "node_modules"), "dir");
          await writeFile(
            join(fixture.server, "index.ts"),
            'console.log("ready"); if (process.argv[2] === "invoke") console.log((await import("./later.ts")).value);',
            { signal },
          );
          await writeFile(
            join(fixture.server, "later.ts"),
            'export const value = "lazy route ready";',
            { signal },
          );
        });
        const built = yield* fixture.prepare();
        expect(built.exitCode, built.stderr + built.stdout).toBe(0);
        yield* assertModuleLinkAbsent(fixture.server);
        const chunks = yield* ownedNativePromise("test.lazyChunks", () => readdir(fixture.server));
        expect(chunks.some((path) => path !== "index.js" && path.endsWith(".js"))).toBe(true);
        const source = yield* ownedNativePromise("test.lazyEntrypoint", () =>
          readFile(join(fixture.server, "index.js"), "utf8"),
        );
        expect(source).toContain("import(");
        expect(source).not.toContain("lazy route ready");
        yield* ownedNativePromise("test.hideModules", () =>
          rm(fixture.modules, { recursive: true, force: true }),
        );
        const relocated = join(fixture.root, "relocated");
        yield* ownedNativePromise("test.relocate", () => rename(fixture.server, relocated));
        const started = yield* runFixtureBun([join(relocated, "index.js"), "invoke"], fixture.root);
        expect({ code: started.exitCode, output: started.stdout + started.stderr }).toEqual({
          code: 0,
          output: "ready\nlazy route ready\n",
        });
      }),
    ).pipe(Effect.provide(processLayer)),
  ));

/**
 * Checks that completed or rejected bundles release their temporary resolution link.
 * @param server - Fixture-owned emitted source directory.
 * @returns Joined native absence assertion, with original fixture I/O failure preserved.
 */
function assertModuleLinkAbsent(server: string) {
  return ownedNativePromise("test.moduleLink", () =>
    expect(lstat(join(server, "node_modules"))).rejects.toMatchObject({ code: "ENOENT" }),
  );
}
