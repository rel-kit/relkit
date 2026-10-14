/** Owns copied flat compatibility roots and borrowed workspace links for native CLI check/build/start acceptance. */
import { afterEach } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer, ManagedRuntime, Scope } from "effect";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { linkWorkspacePackages } from "../../../packages/cli/test-workspace.js";

/** One native test invocation captures its fixture scope before admitting any copy or dependency link. */
class CommandFixture extends Context.Service<CommandFixture>()("relkit.tests.CommandFixture", {
  make: Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    return {
      copy: (path: string) => copyFixture(path).pipe(Effect.provideService(Scope.Scope, scope)),
    };
  }),
}) {}
let owner: ManagedRuntime.ManagedRuntime<CommandFixture, never> | undefined;

/**
 * Registers cleanup in each consuming Bun test file rather than only the first imported module's suite.
 * @returns Native hook registration; each case joins all acquired roots before the next case starts.
 */
export function registerCommandCleanup(): void {
  afterEach(async () => {
    const current = owner;
    owner = undefined;
    await current?.dispose();
  });
}

/**
 * Acquires a copied project before finite native writes, retaining installed SDK entries only as borrowed links.
 * @param path - Checked-in flat compatibility fixture, never modified.
 * @returns The test-owned project; interruption joins native copy/link work before root removal.
 */
const copyFixture = Effect.fn("CommandFixture.copy")(function* (path: string) {
  const root = yield* Effect.acquireRelease(
    scaffoldNative("command.fixture", () => mkdtemp(join(process.cwd(), ".relkit-cli-test-"))),
    (root) =>
      scaffoldNative("command.fixture.release", () =>
        rm(root, { recursive: true, force: true }),
      ).pipe(Effect.orDie),
  );
  yield* scaffoldNative("command.fixture.copy", () =>
    cp(join(process.cwd(), path), root, { recursive: true }),
  );
  yield* scaffoldNative("command.fixture.manifest", () =>
    cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json")),
  );
  yield* scaffoldNative("command.fixture.modules", () =>
    rm(join(root, "node_modules"), { recursive: true, force: true }),
  );
  yield* scaffoldNative("command.fixture.links", () => linkWorkspacePackages(root));
  return root;
});

/**
 * Exposes the existing native Promise fixture edge with runner-owned cleanup.
 * @param path - Checked-in flat compatibility fixture.
 * @returns The copied root, released by afterEach after native application owners close.
 */
export function copyProject(path: string): Promise<string> {
  owner ??= ManagedRuntime.make(Layer.effect(CommandFixture, CommandFixture.make));
  return owner.runPromise(Effect.flatMap(CommandFixture, (fixture) => fixture.copy(path)));
}
