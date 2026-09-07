import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function runScaffoldTerminal(
  command: string[],
  cwd: string,
  answers: readonly (readonly [string, string])[],
  env: Record<string, string> = {},
): Promise<{ code: number; output: string }> {
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
    signal: AbortSignal.timeout(60_000),
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

export async function verifyInteractiveResolver(root: string): Promise<void> {
  const api = await import(
    pathToFileURL(join(root, "node_modules/create-relkit/dist/index.js")).href
  );
  const answers = {
    text: async ({ message }: { readonly message: string }) =>
      message === "Project name" ? "interactive-app" : "interactive-project",
    select: async ({ message }: { readonly message: string }) =>
      ({ "Starter template": "api", "Cloud provider": "none", "Deployment adapter": "none" })[
        message as "Starter template" | "Cloud provider" | "Deployment adapter"
      ],
    multiselect: async () => [],
    confirm: async () => false,
    note: () => undefined,
    intro: () => undefined,
    outro: () => undefined,
  };
  const resolved = await api.resolveCreateOptionsDetails([], {
    interactive: true,
    promptDriver: answers,
  });
  assert.equal(resolved.options.name, "interactive-app");
  assert.equal(resolved.options.template, "api");
  assert.equal(resolved.options.directory, "interactive-project");
}
