/**
 * Runs opt-in installed-app acceptance against a disposable minimal app directory.
 * It backs up authored inputs, invokes the source CLI through literal `bun dev`,
 * proves both startup paths, and joins all processes before restoring inputs.
 * Usage: bun recovery.probe.ts <temporary-installed-minimal-app> [--source-only].
 * Evidence is written to a fresh owned temporary directory printed at startup.
 */
import { expect } from "bun:test";
import { readFile, realpath, rm, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { CliProcess, processLayer } from "../../src/services/process.service.js";
import { recoveryProcess } from "./recovery-process.js";
import {
  environmentCycle,
  environmentSource,
  handlerSource,
  serving,
  sourceCycle,
} from "./recovery-cycles.js";

const appPath = process.argv[2];
if (appPath === undefined) throw new Error("Expected temporary app directory");
if (
  process.argv.length > 4 ||
  (process.argv[3] !== undefined && process.argv[3] !== "--source-only")
)
  throw new Error("Probe owns its evidence directory; only --source-only is accepted");
const temporary = await realpath(tmpdir());
const candidate = resolve(appPath);
const temporaryBase = candidate.startsWith(temporary + "/") ? temporary : resolve(tmpdir());
if (!candidate.startsWith(temporaryBase + "/"))
  throw new Error("Probe requires a disposable temporary app");
const root = await realpath(candidate);
const cliRoot = resolve(import.meta.dirname, "../..");
if (!root.startsWith(temporary + "/")) throw new Error("Probe requires a disposable temporary app");
const evidence = await mkdtemp(join(tmpdir(), "relkit-dev-recovery-evidence-"));
console.log(`Evidence directory: ${evidence}`);
const names = [
  "package.json",
  "src/platform/env.ts",
  "src/services/hello/functions/hello.function.ts",
  "src/services/hello/service.ts",
  "src/routes/hello/route.ts",
  "src/routes/recovery/route.ts",
  "relkit.config.ts",
  "tsconfig.json",
  ".env",
  ".env.local",
  ".env.development.local",
];
const originals = new Map<string, string | undefined>();
for (const name of names)
  originals.set(name, await readFile(join(root, name), "utf8").catch(() => undefined));

/** Allocates one fixture port without borrowing an unrelated listener. */
function port() {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const value = server.port;
  server.stop(true);
  return value;
}

/**
 * Prepares a fresh source receipt after all fixture-authored inputs are installed.
 * @param root - Owned installed app.
 * @param log - Evidence path for the finite preparation output.
 * @returns Successful preparation after its output readers and process settle.
 */
async function prepare(root: string, log: string) {
  const output = await Effect.runPromise(
    CliProcess.use((processes) =>
      processes.run({
        command: process.execPath,
        args: [join(cliRoot, "src/bin.ts"), "dev", "--prepare", "--project-root", root],
        cwd: root,
        environment: { ...process.env, NODE_ENV: "development" },
      }),
    ).pipe(Effect.timeout(60_000), Effect.provide(processLayer)),
  );
  await writeFile(log, output.stdout + "\n" + output.stderr);
  expect(output.exitCode).toBe(0);
}

/**
 * Runs all cycles under one unchanged executable PID for the selected startup path.
 * @param mode - Startup path required for this replay.
 * @returns Completion after HTTP assertions and joined process cleanup.
 */
async function replay(mode: "ordinary" | "prepared") {
  const publicPort = port();
  const manifest = JSON.parse(originals.get("package.json") ?? "null");
  manifest.scripts.dev = `bun ${join(cliRoot, "src/bin.ts")} dev --port ${publicPort} --local off --no-color --verbose`;
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  await writeFile(join(root, "src/platform/env.ts"), environmentSource(false));
  await writeFile(join(root, "src/services/hello/functions/hello.function.ts"), handlerSource());
  const route = originals.get("src/routes/hello/route.ts");
  if (route === undefined) throw new Error("Missing fixture route");
  await mkdir(join(root, "src/routes/recovery"), { recursive: true });
  await writeFile(join(root, "src/routes/recovery/route.ts"), route);
  await rm(join(root, "src/routes/hello/route.ts"), { force: true });
  for (const name of [".env", ".env.local", ".env.development.local"])
    await rm(join(root, name), { force: true });
  if (mode === "prepared") await prepare(root, join(evidence, "prepare.txt"));
  const session = recoveryProcess(root, mode, publicPort);
  try {
    await serving(session, "initial");
    expect(session.logs().includes(".relkit/dev/sessions/")).toBe(mode === "prepared");
    if (!process.argv.includes("--source-only")) {
      await environmentCycle(root, session);
      console.log(
        `${mode}: environment creation, edits, expansion, removal and fallback passed (PID ${session.child.pid})`,
      );
    }
    await sourceCycle(root, session);
    console.log(
      `${mode}: syntax, descriptor, import, deletion, config and in-flight multi-file burst recovery passed`,
    );
    const before = session.logs().length;
    await writeFile(
      join(root, "src/services/hello/functions/hello.function.ts"),
      "export default (",
    );
    await session.wait("Expected in-flight compilation before shutdown", () =>
      session.logs().slice(before).includes("candidate.compile.started"),
    );
  } finally {
    await session.stop();
    await writeFile(join(evidence, `${mode}-after.log`), session.logs());
  }
  console.log(`${mode}: shutdown released the public listener`);
}

try {
  for (const mode of ["ordinary", "prepared"] as const) await replay(mode);
} finally {
  for (const [name, text] of originals) {
    if (text === undefined) await rm(join(root, name), { force: true });
    else await writeFile(join(root, name), text);
  }
}
