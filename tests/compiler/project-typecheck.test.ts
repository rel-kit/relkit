import { expect, test } from "bun:test";
import { Effect, Exit, Fiber } from "effect";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { typecheckProject } from "../../packages/compiler/src/project-typecheck.js";
import { generateRouteModuleChecks } from "../../packages/compiler/src/route-module-checks.js";

const repository = resolve(import.meta.dir, "../..");

/**
 * Own one fixture until its native setup and test operations physically settle.
 * @param use - Assertions and native operations using the captured project root.
 * @param rootDir - Compiler source root written to the fixture configuration.
 * @param generatedDirectory - Directory containing generated route assertions.
 * @returns A lazy effect that removes its own parent after success or failure.
 * @remarks Bun timeouts do not cancel native Promises. The native use boundary
 * waits for settlement before cleanup, even when its Effect fiber is interrupted.
 */
function withFixture(
  use: (root: string) => Promise<void>,
  rootDir = "src",
  generatedDirectory = ".relkit/generated",
) {
  return Effect.acquireUseRelease(
    Effect.promise(async () => {
      await mkdir(join(repository, ".relkit"), { recursive: true });
      return mkdtemp(join(repository, ".relkit/project-typecheck-"));
    }),
    (parent) =>
      Effect.promise(async () => {
        const root = await prepareFixture(parent, rootDir, generatedDirectory);
        await use(root);
      }).pipe(Effect.uninterruptible),
    (parent) => Effect.promise(() => rm(parent, { recursive: true, force: true })),
  );
}

/**
 * Prepare the project inside its already-owned parent directory.
 * @param parent - Directory whose release is owned by withFixture.
 * @param rootDir - Compiler source root to configure.
 * @param generatedDirectory - Destination for generated route assertions.
 * @returns The project directory after every native setup operation settles.
 */
async function prepareFixture(parent: string, rootDir: string, generatedDirectory: string) {
  const root = join(parent, "app");
  await mkdir(join(root, "src/routes"), { recursive: true });
  await mkdir(join(root, generatedDirectory), { recursive: true });
  await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
  await symlink(join(repository, "packages/app"), join(root, "node_modules/@relkit/app"));
  await writeFile(join(root, "src/example.ts"), "export const example = 1;\n");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        rootDir,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ["bun"],
      },
      include: ["src/**/*.ts"],
      exclude: ["node_modules", ".relkit"],
    }),
  );
  return root;
}

/**
 * Write the same generated route checks used by the compiler.
 * @param root - Fixture project directory.
 * @param files - Authored modules requiring assertions.
 * @param generatedDirectory - Destination relative to the fixture root.
 * @returns A promise fulfilled when the native write has settled.
 */
async function writeChecks(root: string, files: readonly string[], generatedDirectory: string) {
  await writeFile(
    join(root, generatedDirectory, "route-module-checks.ts"),
    generateRouteModuleChecks(files, root, generatedDirectory),
  );
}

test("generated checks do not reject rootDir src projects without routes", () =>
  Effect.runPromise(
    withFixture(async (root) => {
      const config = await readFile(join(root, "tsconfig.json"), "utf8");
      expect(typecheckProject(root)).toEqual([]);
      await writeChecks(root, ["src/example.ts"], ".relkit/generated");
      expect(typecheckProject(root)).toEqual([]);
      expect(await readFile(join(root, "tsconfig.json"), "utf8")).toBe(config);
    }),
  ));

test("route assertions outside rootDir still reject invalid exports", async () => {
  for (const generatedDirectory of [".relkit/generated", "generated/types"]) {
    await Effect.runPromise(
      withFixture(
        async (root) => {
          const route = join(root, "src/routes/route.ts");
          await writeFile(
            route,
            'import { defineRoute } from "@relkit/app/routes";\nexport const GET = defineRoute({ handler: () => new Response("ok") });\n',
          );
          await writeChecks(root, ["src/routes/route.ts"], generatedDirectory);
          expect(typecheckProject(root, generatedDirectory)).toEqual([]);
          await writeFile(route, 'export const GET = "not a route";\n');
          const diagnostics = typecheckProject(root, generatedDirectory);
          expect(diagnostics).toContainEqual(expect.objectContaining({ code: "TS2344" }));
          expect(diagnostics.some(({ code }) => code === "TS6059")).toBe(false);
        },
        "src",
        generatedDirectory,
      ),
    );
  }
}, 15_000);

test("validation retains a broader rootDir and ordinary source type errors", () =>
  Effect.runPromise(
    withFixture(async (root) => {
      await writeFile(join(root, "../shared.ts"), "export const shared = 1;\n");
      await writeFile(
        join(root, "src/example.ts"),
        'import { shared } from "../../shared.js";\nexport const example: string = shared;\n',
      );
      await writeChecks(root, ["src/example.ts"], ".relkit/generated");
      expect(typecheckProject(root).map(({ code }) => code)).toEqual(["TS2322"]);
    }, ".."),
  ));

test("fixture release joins native work after interruption and body failure", async () => {
  const ready = Promise.withResolvers<string>();
  const resume = Promise.withResolvers<void>();
  const failure = new Error("fixture body failed after native settlement");
  const fiber = Effect.runFork(
    withFixture(async (root) => {
      ready.resolve(root);
      await resume.promise;
      await writeFile(join(root, "src/example.ts"), "export const settled = true;\n");
      throw failure;
    }),
  );
  const root = await ready.promise;
  try {
    fiber.interruptUnsafe();
    await Effect.runPromise(
      withFixture(async (other) => {
        expect(other).not.toBe(root);
        expect(await readFile(join(other, "src/example.ts"), "utf8")).toBe(
          "export const example = 1;\n",
        );
      }),
    );
    expect(await readFile(join(root, "src/example.ts"), "utf8")).toBe(
      "export const example = 1;\n",
    );
  } finally {
    resume.resolve();
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons).toContainEqual(
        expect.objectContaining({ _tag: "Die", defect: failure }),
      );
    }
  }
  await expect(readFile(join(root, "src/example.ts"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});
