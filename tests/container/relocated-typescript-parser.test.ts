/**
 * Runs the CLI's bundled TypeScript parser from a place its build never was: the built
 * `packages/cli/dist` mounted into the Linux Bun image the generated Dockerfile builds in. The
 * bundle used to inline the building checkout's absolute `__filename`, so off that machine it
 * loaded no default library, every route type degraded to `any` and `relkit build` on Railway
 * rejected every route. Checks on the build machine itself could not see it.
 */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BUN_IMAGE } from "../../packages/cli/src/commands/build-container.ts";

const dist = resolve(import.meta.dir, "../../packages/cli/dist");

const PROBE = `
const ts = (await import("/opt/relkit-cli/dist/typescript-parser.js")).default;
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true, noEmit: true };
const program = ts.createProgram({ rootNames: ["/work/source.ts"], options });
const messages = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
console.log(JSON.stringify({ library: ts.getDefaultLibFilePath(options), messages }));
`;

const SOURCE = `
export const doubled: Array<number> = [1, 2].map((value) => value * 2);
export const later: Promise<string> = Promise.resolve("ready");
`;

test("the bundled TypeScript parser loads its default library outside the build checkout", async () => {
  expect(await Bun.file(join(dist, "typescript-parser.js")).exists()).toBe(true);
  const work = await mkdtemp(join(tmpdir(), "relkit-relocated-parser-"));
  try {
    await writeFile(join(work, "probe.mjs"), PROBE);
    await writeFile(join(work, "source.ts"), SOURCE);
    const child = Bun.spawn(
      [
        "docker",
        "run",
        "--rm",
        "-v",
        `${dist}:/opt/relkit-cli/dist:ro`,
        "-v",
        `${work}:/work:ro`,
        BUN_IMAGE,
        "bun",
        "/work/probe.mjs",
      ],
      { stdout: "pipe", stderr: "inherit" },
    );
    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    expect(code).toBe(0);
    const result = JSON.parse(output.trim()) as { library: string; messages: string[] };
    expect(result.library).toStartWith("/opt/relkit-cli/dist/typescript-lib/");
    expect(result.messages).toEqual([]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}, 300_000);
