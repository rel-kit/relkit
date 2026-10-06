import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ScaffoldTerminalResult } from "./scaffold-smoke-terminal.types.js";

const SCAFFOLD_TERMINAL_TIMEOUT_MS = 600_000;

/** Runs a real packed CLI in a bounded native terminal and answers prompts in order.
 * @param command - Script executable and its literal argument vector.
 * @param cwd - Standalone application directory.
 * @param answers - Expected prompt fragments and terminal input, in display order.
 * @param env - Explicit overrides for this child only.
 * @returns The physical child exit and captured terminal display after every answer was sent.
 * @remarks Native Bun.Terminal behavior is the acceptance boundary, including Ctrl-C.
 */
export async function runScaffoldTerminal(
  command: string[],
  cwd: string,
  answers: readonly (readonly [string, string])[],
  env: Record<string, string> = {},
): Promise<ScaffoldTerminalResult> {
  let output = "";
  let answered = 0;
  const terminal = new Bun.Terminal({
    cols: 120,
    rows: 40,
    data(term, bytes) {
      output += new TextDecoder().decode(bytes);
      const next = answers[answered];
      if (next && output.includes(next[0])) {
        answered++;
        term.write(next[1]);
      }
    },
  });
  const child = Bun.spawn([process.execPath, ...command], {
    cwd,
    terminal,
    env: { ...process.env, CI: "", NO_COLOR: "1", TERM: "xterm-256color", ...env },
    signal: AbortSignal.timeout(SCAFFOLD_TERMINAL_TIMEOUT_MS),
  });
  try {
    const code = await child.exited;
    assert.equal(answered, answers.length, `Missing terminal prompt:\n${output}`);
    return { code, output };
  } finally {
    if (child.exitCode === null) child.kill();
    terminal.close();
  }
}

/** Verifies packed artifact cancellation and the separate Docker startup consent.
 * @param root - Installed standalone application with the billing service.
 * @param cli - Actual packed CLI executable.
 * @returns After cancellation, declined consent, failed startup, and successful startup assertions.
 */
export async function verifyScaffoldTerminal(root: string, cli: string): Promise<void> {
  const cancelled = await runScaffoldTerminal([cli, "add", "service"], root, [
    ["service name", "\x03"],
  ]);
  assert.equal(cancelled.code, 130, cancelled.output);
  const declined = await runScaffoldTerminal(
    [cli, "add", "cache", "terminal-cache", "--service", "billing", "--profile", "local"],
    root,
    [["Start local Docker services now?", "n\r"]],
  );
  assert.equal(declined.code, 0, declined.output);
  assert.ok(existsSync(join(root, "src/billing/cache/terminal-cache.cache.ts")));
  assert.ok(declined.output.includes("Run `relkit local up`"));
  assert.ok(!declined.output.includes("Descriptors"));
  for (const unavailable of [true, false]) {
    const name = unavailable ? "docker-unavailable" : "docker-approved";
    const result = await runScaffoldTerminal(
      [cli, "add", "cache", name, "--service", "billing", "--profile", "local"],
      root,
      [["Start local Docker services now?", "y\r"]],
      unavailable ? { DOCKER_HOST: `unix://${join(root, "missing-docker.sock")}` } : {},
    );
    assert.equal(result.code, unavailable ? 1 : 0, result.output);
    assert.ok(existsSync(join(root, `src/billing/cache/${name}.cache.ts`)));
    assert.equal(
      result.output.includes("Scaffold saved, but local services could not start"),
      unavailable,
    );
    if (!unavailable) assert.ok(!result.output.includes("Run `relkit local up`"), result.output);
  }
}

/** Verifies the packed public resolver's minimal defaults and explicit advanced flags.
 * @param root - Registry consumer containing the actual packed generator.
 * @returns After asserting only a missing name is requested before final generation confirmation.
 */
export async function verifyInteractiveResolver(root: string): Promise<void> {
  // Release staging verifies this package/version before installation; assert the
  // packed public contract against the same authored API used by scaffold callers.
  const api = (await import(
    pathToFileURL(join(root, "node_modules/create-relkit/dist/index.js")).href
  )) as typeof import("create-relkit");
  const requested: string[] = [];
  const answers = {
    text: async ({ message }: { readonly message: string }) => {
      requested.push(message);
      assert.equal(message, "Project name");
      return "interactive-app";
    },
    select: async () => {
      throw new Error("Creation requested an unexpected selection.");
    },
    multiselect: async () => {
      throw new Error("Creation requested an unexpected multiselect.");
    },
    confirm: async () => {
      throw new Error("Confirmation belongs to generation, after option resolution.");
    },
    note: () => undefined,
    intro: () => undefined,
    outro: () => undefined,
  };
  const resolved = await api.resolveCreateOptionsDetails([], {
    interactive: true,
    promptDriver: answers,
  });
  assert.equal(resolved.options.name, "interactive-app");
  assert.equal(resolved.options.template, "minimal");
  assert.equal(resolved.options.directory, undefined);
  assert.equal(resolved.options.cloud, "none");
  assert.equal(resolved.options.deploy, "none");
  assert.equal(resolved.options.jobs, undefined);
  assert.equal(resolved.options.install, true);
  assert.equal(resolved.options.git, true);
  assert.equal(resolved.options.examples, true);
  assert.deepEqual(requested, ["Project name"]);
  requested.length = 0;
  const explicit = await api.resolveCreateOptionsDetails(
    ["named-app", "--template", "api", "--directory", "explicit-project", "--no-install"],
    { interactive: true, promptDriver: answers },
  );
  assert.equal(explicit.options.name, "named-app");
  assert.equal(explicit.options.template, "api");
  assert.equal(explicit.options.directory, "explicit-project");
  assert.equal(explicit.options.install, false);
  assert.deepEqual(requested, []);
}
