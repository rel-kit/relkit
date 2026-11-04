/**
 * Starts the Inspector browser fixture (a real bridge, real Inspector endpoints and real records)
 * as a running development session that `relkit mcp` can discover, and connects MCP clients to
 * `relkit mcp` over stdio.
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export const repositoryRoot = resolve(import.meta.dir, "../../../..");
export const cliEntry = resolve(repositoryRoot, "packages/cli/src/bin.ts");

/** A running fixture session and its project root. */
export interface McpFixtureSession {
  readonly project: string;
  readonly backend: string;
  readonly stop: () => Promise<void>;
}

/**
 * Starts the fixture server and waits until its bridge descriptor exists.
 * @returns The project root the descriptor was published for.
 */
export async function startFixtureSession(): Promise<McpFixtureSession> {
  await mkdir(join(repositoryRoot, ".relkit"), { recursive: true });
  const runs = await mkdtemp(join(repositoryRoot, ".relkit/inspector-browser-mcp-"));
  const project = join(runs, "project");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const child = Bun.spawn(["bun", "tests/inspector/fixture-server.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      RELKIT_FIXTURE_PORT: String(port),
      RELKIT_FIXTURE_PROJECT: project,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const deadline = Date.now() + 30_000;
  const connections = join(project, ".relkit/connections");
  while (Date.now() < deadline) {
    const files = await Array.fromAsync(new Bun.Glob("*.json").scan({ cwd: connections })).catch(
      () => [] as string[],
    );
    if (files.length > 0) break;
    if (child.exitCode !== null)
      throw new Error(`Fixture exited: ${await new Response(child.stderr).text()}`);
    await Bun.sleep(100);
  }
  return {
    project,
    backend: `http://127.0.0.1:${port}`,
    stop: async () => {
      child.kill();
      await child.exited;
      await rm(runs, { recursive: true, force: true });
    },
  };
}

/**
 * Starts `relkit mcp` for a project and connects an MCP client to it over stdio.
 * @param project - Project root passed as `--project-root`.
 * @returns The connected client.
 */
export async function connectRelkitMcp(project: string): Promise<Client> {
  const client = new Client({ name: "relkit-mcp-test", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [cliEntry, "mcp", "--project-root", project],
      cwd: repositoryRoot,
      stderr: "pipe",
    }),
  );
  return client;
}
