/**
 * A production build contains no `relkit mcp` entry point: no stdio MCP transport, no relkit mcp
 * code and no copy of the CLI, even for an application that ran a development session with the
 * Inspector bridge enabled.
 */
import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { generatedAppFixture } from "../fixtures/inspector/generated-app.js";
import { runCli } from "../../packages/cli/src/main.js";

/** Strings only the development MCP server and its CLI command contain. */
const MCP_MARKERS = [
  "@modelcontextprotocol/server/stdio",
  "StdioServerTransport",
  "relkit-mcp-",
  "RELKIT_MCP_NO_SESSION",
  "Cli.mcp",
  "commands/mcp",
] as const;

/** Lists every file below a directory. */
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

test("production builds contain no relkit mcp entry point", async () => {
  const fixture = await generatedAppFixture();
  try {
    await fixture.session.stop();
    const errors: string[] = [];
    const status = await runCli(["build", "--project-root", fixture.projectRoot, "--json"], {
      installSignalHandlers: false,
      io: { stdout: () => {}, stderr: (line) => errors.push(line) },
    });
    expect(status, errors.join("\n")).toBe(0);
    const build = join(fixture.projectRoot, ".relkit/build");
    const output = await files(build);
    expect(output.some((path) => path.endsWith("server/index.js"))).toBe(true);
    const paths = output.map((path) => relative(build, path));
    expect(paths.filter((path) => /(?:^|\/)@relkit\/cli\//u.test(path))).toEqual([]);
    expect(paths.filter((path) => /(?:^|\/)mcp(?:-[a-z]+)?\.(?:[cm]?js|ts)$/u.test(path))).toEqual(
      [],
    );
    const found: string[] = [];
    for (const path of output) {
      if (!/\.(?:[cm]?js|json|ts)$/u.test(path)) continue;
      const source = await readFile(path, "utf8");
      for (const marker of MCP_MARKERS)
        if (source.includes(marker)) found.push(`${relative(build, path)}: ${marker}`);
    }
    expect(found).toEqual([]);
  } finally {
    await fixture.close();
  }
}, 180_000);
