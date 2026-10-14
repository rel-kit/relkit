/** Exercises packed CLI cancellation and Docker consent through scope-owned native terminal invocations. */
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { scaffoldTerminal } from "./scaffold-terminal-owner.js";
import { interactiveResolver } from "./scaffold-resolver.js";
import type { ScaffoldTerminalResult } from "./scaffold-smoke-terminal.types.js";

/** Native terminal authority is constructed per script invocation; input belongs to each child. */
class ScaffoldTerminal extends Context.Service<ScaffoldTerminal>()(
  "relkit.scripts.ScaffoldTerminal",
  {
    make: Effect.sync(() => ({ run: terminal, verify: verifyTerminal })),
  },
) {}
const terminalLayer = Layer.effect(ScaffoldTerminal, ScaffoldTerminal.make);

/**
 * Supplies exact native terminal arguments without changing child ownership.
 * @param command - Installed executable and literal arguments.
 * @param cwd - Standalone application root.
 * @param answers - Ordered prompt fragments and terminal input.
 * @param env - Child-only environment overrides.
 * @returns Scoped exit and display output after terminal release.
 */
function terminal(
  command: string[],
  cwd: string,
  answers: readonly (readonly [string, string])[],
  env: Record<string, string> = {},
) {
  return scaffoldTerminal({ command, cwd, answers, env });
}

/** Verifies packed artifact cancellation and the separate Docker startup consent.
 * @param root - Installed standalone application with the billing service.
 * @param cli - Actual packed CLI executable.
 * @returns After cancellation, declined consent, failed startup, and successful startup assertions.
 */
const verifyTerminal = Effect.fn("ScaffoldTerminal.verify")(function* (root: string, cli: string) {
  const cancelled = yield* terminal([cli, "add", "service"], root, [["service name", "\x03"]]);
  assert.equal(cancelled.code, 130, cancelled.output);
  const declined = yield* terminal(
    [cli, "add", "cache", "terminal-cache", "--service", "billing", "--profile", "local"],
    root,
    [["Start local Docker services now?", "n\r"]],
  );
  assert.equal(declined.code, 0, declined.output);
  assert.ok(existsSync(join(root, "src/services/billing/cache/terminal-cache.cache.ts")));
  assert.ok(declined.output.includes("Run `relkit local up`"));
  assert.ok(!declined.output.includes("Descriptors"));
  for (const unavailable of [true, false]) {
    const name = unavailable ? "docker-unavailable" : "docker-approved";
    const result = yield* terminal(
      [cli, "add", "cache", name, "--service", "billing", "--profile", "local"],
      root,
      [["Start local Docker services now?", "y\r"]],
      unavailable ? { DOCKER_HOST: `unix://${join(root, "missing-docker.sock")}` } : {},
    );
    assert.equal(result.code, unavailable ? 1 : 0, result.output);
    assert.ok(existsSync(join(root, `src/services/billing/cache/${name}.cache.ts`)));
    assert.equal(
      result.output.includes("Scaffold saved, but local services could not start"),
      unavailable,
    );
    if (!unavailable) assert.ok(!result.output.includes("Run `relkit local up`"), result.output);
  }
});

/**
 * Runs the finite native terminal boundary from ordinary packed script callers.
 * @param command - Installed executable and arguments.
 * @param cwd - Standalone application root.
 * @param answers - Expected prompts and input, in display order.
 * @param env - Child-only environment overrides.
 * @returns Actual packed exit and bounded terminal output after cleanup.
 */
export function runScaffoldTerminal(
  command: string[],
  cwd: string,
  answers: readonly (readonly [string, string])[],
  env: Record<string, string> = {},
): Promise<ScaffoldTerminalResult> {
  return Effect.runPromise(
    Effect.flatMap(ScaffoldTerminal, (service) => service.run(command, cwd, answers, env)).pipe(
      Effect.provide(terminalLayer),
    ),
  );
}

/**
 * Verifies cancellation, declined consent and unavailable/available local Docker.
 * @param root - Installed application with a grouped Billing service.
 * @param cli - Packed CLI executable.
 * @returns Completion after all native terminal children have closed.
 */
export function verifyScaffoldTerminal(root: string, cli: string): Promise<void> {
  return Effect.runPromise(
    Effect.flatMap(ScaffoldTerminal, (service) => service.verify(root, cli)).pipe(
      Effect.provide(terminalLayer),
    ),
  );
}

/**
 * Verifies the real packed option resolver with a native deterministic prompt driver.
 * @param root - Registry consumer with the installed generator.
 * @returns Completion after default and explicit option-resolution assertions.
 */
export function verifyInteractiveResolver(root: string): Promise<void> {
  return Effect.runPromise(interactiveResolver(root));
}
