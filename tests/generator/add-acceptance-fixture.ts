/** Owns native temporary app roots and installed dependency borrowing for public scaffold acceptance. */
import { afterEach, test as nativeTest } from "bun:test";
import { cp, lstat, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Context, Effect, Layer, ManagedRuntime, References, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { prepareProjectDependencyPatch } from "../../packages/create-relkit/src/dependency-patches.ts";
import {
  applyScaffoldPlan,
  normalizeAddRequest,
  planAdd,
  SCAFFOLD_DEPENDENCIES,
} from "../../packages/cli/src/scaffolding/index.ts";
import { AddFixtureFailure } from "./add-acceptance-fixture.errors.js";

const repository = resolve(import.meta.dir, "../..");
const templateRoot = join(repository, "templates/default/v1");
export const releaseVersion = SCAFFOLD_DEPENDENCIES["@relkit/local"].version;

/** The test-runner owner captures one scope; every requested app root registers its finalizer there. */
class AddFixture extends Context.Service<AddFixture>()("relkit.tests.AddFixture", {
  make: Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    return {
      project: (template: string) =>
        createProject(template).pipe(Effect.provideService(Scope.Scope, scope)),
    };
  }),
}) {}

const fixtureLayer = Layer.effect(AddFixture, AddFixture.make);
let owner: ManagedRuntime.ManagedRuntime<AddFixture, never> | undefined;
let testOutcome = { passed: false };

/** Registers a native case whose fixture roots are removed only on complete success.
 * @param name - Existing native test name.
 * @param run - Unchanged asynchronous assertions and SDK operations.
 * @param timeout - Existing native test deadline.
 * @returns Native test registration.
 */
export function addTest(name: string, run: () => Promise<void>, timeout?: number): void {
  nativeTest(
    name,
    async () => {
      const outcome = (testOutcome = { passed: false });
      await run();
      outcome.passed = true;
    },
    timeout,
  );
}

/**
 * Registers teardown in each native Bun suite that borrows this shared fixture owner.
 * @returns Registration whose async cleanup joins roots after native SDK operations settle.
 */
export function registerAddCleanup(): void {
  afterEach(async () => {
    const current = owner;
    owner = undefined;
    await current?.dispose();
  });
}

/**
 * Acquires a fixture runtime only when a test requests its first project.
 * @returns The runner-owned runtime disposed by afterEach.
 */
function fixtureOwner() {
  return (owner ??= ManagedRuntime.make(fixtureLayer));
}

/**
 * Copies one maintained template and registers cleanup before copying begins.
 * @param template - Internal candidate template used by native acceptance.
 * @returns Absolute test-owned app root after the dependency patch is staged.
 */
const createProject = Effect.fn("AddFixture.project")(function* (template: string) {
  const outcome = testOutcome;
  const parent = yield* Effect.acquireRelease(
    native("temporary", () => mkdtemp(join(tmpdir(), "relkit-add-acceptance-"))),
    (root) =>
      native("release", async () => {
        if (outcome.passed) await rm(root, { recursive: true, force: true });
        else console.error(`Failed scaffold fixture retained: ${root}`);
      }).pipe(Effect.orDie),
  );
  const root = join(parent, "app");
  yield* native("copy", () => cp(join(templateRoot, template), root, { recursive: true }));
  yield* native("dependencyPatch", () => prepareProjectDependencyPatch(root));
  return root;
});

/**
 * Exposes the native Bun test boundary while retaining the acquired fixture scope.
 * @param template - Maintained template directory name.
 * @returns An app whose cleanup is joined by the test runner.
 */
export function project(template: string): Promise<string> {
  return fixtureOwner().runPromise(
    Effect.flatMap(AddFixture, (fixture) => fixture.project(template)),
  );
}

/**
 * Exercises the actual public scaffold plan/apply ABI with an explicit finite command replacement.
 * @param root - Test-owned app.
 * @param args - Literal native add arguments.
 * @returns Completion after the owned SDK operation settles.
 */
export function add(root: string, args: readonly string[]): Promise<void> {
  return fixtureOwner().runPromise(
    native("add", async () => {
      const request = normalizeAddRequest([...args, "--project-root", root]);
      await applyScaffoldPlan(await planAdd(request), {
        commandRunner: async () => ({ exitCode: 0 }),
        relkitExecutable: "relkit",
      });
    }),
  );
}

/**
 * Borrows installed SDK package identities without downloading or mutating contributor dependencies.
 * @param root - Caller-owned app whose links are removed with its parent scope.
 * @returns Completion after all literal package links have been installed.
 */
export function linkDependencies(root: string): Promise<void> {
  return fixtureOwner().runPromise(linkInstalledDependencies(root));
}

/**
 * Installs all fixture-specific dependency aliases in deterministic order.
 * @param root - Test-owned application root.
 * @returns Completion after source and type-resolution dependencies exist.
 */
const linkInstalledDependencies = Effect.fn("AddFixture.dependencies")(function* (root: string) {
  const relkit = join(root, "node_modules/@relkit");
  for (const name of ["app", "testing", "drizzle", "better-auth"])
    yield* link(join(repository, "packages", name), join(relkit, name));
  for (const name of ["docker", "local", "redis", "s3", "langchain"])
    yield* link(join(repository, "integrations/packages", name), join(relkit, name));
  const aliases = [
    ["node_modules/effect", "effect"],
    ["integrations/packages/langchain/node_modules/langchain", "langchain"],
    ["integrations/packages/langchain/node_modules/langsmith", "langsmith"],
    ["integrations/packages/langchain/node_modules/@langchain/core", "@langchain/core"],
    ["packages/runtime-hono/node_modules/@ag-ui/core", "@ag-ui/core"],
    ["integrations/packages/langchain/node_modules/@langchain/langgraph", "@langchain/langgraph"],
    ["packages/drizzle/node_modules/drizzle-orm", "drizzle-orm"],
    ["packages/better-auth/node_modules/better-auth", "better-auth"],
    ["node_modules/.bun/@types+bun@1.3.10/node_modules/@types/bun", "@types/bun"],
  ] as const;
  for (const [source, destination] of aliases)
    yield* link(join(repository, source), join(root, "node_modules", destination));
});

/**
 * Creates one local dependency entry after confirming it does not already exist.
 * @param target - Borrowed installed dependency.
 * @param path - Test-owned lexical location.
 * @returns Completion without replacing an existing authored entry.
 */
function link(target: string, path: string) {
  return native("link", async () => {
    await mkdir(dirname(path), { recursive: true });
    try {
      await lstat(path);
      return;
    } catch (cause) {
      if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "ENOENT") throw cause;
    }
    await symlink(target, path);
  });
}

/**
 * Joins a finite foreign SDK/filesystem operation before interruption can release its app root.
 * @typeParam A - Native success.
 * @param operation - Fixed safe fixture context.
 * @param run - Exact native operation.
 * @returns Observed success or tagged native failure.
 */
function native<A>(operation: string, run: () => Promise<A>): Effect.Effect<A, AddFixtureFailure> {
  return observeExecution(
    "testing",
    "scaffold." + operation,
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        new AddFixtureFailure({
          operation,
          cause: new Error("Native scaffold fixture operation failed", { cause }),
        }),
    }).pipe(Effect.uninterruptible, Effect.provideService(References.MinimumLogLevel, "None")),
  );
}
