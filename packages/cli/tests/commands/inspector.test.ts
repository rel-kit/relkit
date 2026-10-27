/**
 * Verifies `relkit inspector` launches the project-local inspector bin with the
 * application root and forwarded UI flags, and that a missing package fails with
 * install guidance instead of a spawn error. The terminal is replaced by a
 * recording ContributorTerminal; package resolution uses a real temporary project.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit, Layer } from "effect";
import { runInspectorEffect } from "../../src/commands/inspector.js";
import { ContributorTerminal } from "../../src/contributor-process.service.js";
import type { CliCommandContext } from "../../src/main-support.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * Creates an application root, optionally with an installed inspector package.
 * @param installed - Whether node_modules/@relkit/inspector is present.
 * @returns The absolute temporary application root.
 */
async function application(installed: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-inspector-command-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), '{"name":"app","private":true}');
  if (!installed) return root;
  const pkg = join(root, "node_modules/@relkit/inspector");
  await mkdir(join(pkg, "dist"), { recursive: true });
  await writeFile(join(pkg, "dist/index.js"), "export {};\n");
  await writeFile(
    join(pkg, "package.json"),
    JSON.stringify({
      name: "@relkit/inspector",
      type: "module",
      bin: { "relkit-inspector": "./dist/bin.js" },
      exports: { ".": { import: "./dist/index.js" } },
    }),
  );
  return root;
}

/**
 * Builds the invocation context consumed by the command.
 * @param cwd - Working directory for relative project roots.
 * @returns A context whose presentation sinks are unused by this command.
 */
function context(cwd: string): CliCommandContext {
  return {
    command: "inspector",
    args: [],
    json: false,
    cwd,
    signal: new AbortController().signal,
    log: () => undefined,
    reporter: { output: () => undefined, error: () => undefined },
  };
}

/**
 * Records launched commands and returns a fixed exit status.
 * @param calls - Caller-owned list receiving each command vector and working directory.
 * @returns A deterministic terminal Layer that starts no process.
 */
function recordingTerminal(calls: Array<readonly [readonly string[], string]>) {
  return Layer.succeed(
    ContributorTerminal,
    ContributorTerminal.of({
      run: (command, cwd) =>
        Effect.sync(() => {
          calls.push([command, cwd]);
          return 7;
        }),
    }),
  );
}

test("launches the project-local bin with the root and forwarded UI flags", async () => {
  const root = await application(true);
  const calls: Array<readonly [readonly string[], string]> = [];
  const code = await Effect.runPromise(
    runInspectorEffect(["--port", "4321", "--hostname", "0.0.0.0"], context(root)).pipe(
      Effect.provide(Layer.merge(recordingTerminal(calls), fileSystemLayer)),
    ),
  );
  expect(code).toBe(7);
  expect(calls).toHaveLength(1);
  const [command, cwd] = calls[0]!;
  expect(cwd).toBe(root);
  expect(command.slice(2)).toEqual([
    "--project-root",
    root,
    "--port",
    "4321",
    "--hostname",
    "0.0.0.0",
  ]);
  expect(command[0]).toBe(process.execPath);
  expect(command[1]).toEndWith("node_modules/@relkit/inspector/dist/bin.js");
});

test("resolves a relative --project-root against the working directory", async () => {
  const root = await application(true);
  const calls: Array<readonly [readonly string[], string]> = [];
  await Effect.runPromise(
    runInspectorEffect(["--project-root", "."], context(root)).pipe(
      Effect.provide(Layer.merge(recordingTerminal(calls), fileSystemLayer)),
    ),
  );
  expect(calls[0]?.[0].slice(2)).toEqual(["--project-root", root]);
});

test("a missing package fails with install guidance and launches nothing", async () => {
  const root = await application(false);
  const calls: Array<readonly [readonly string[], string]> = [];
  const exit = await Effect.runPromiseExit(
    runInspectorEffect([], context(root)).pipe(
      Effect.provide(Layer.merge(recordingTerminal(calls), fileSystemLayer)),
    ),
  );
  expect(calls).toEqual([]);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const message = JSON.stringify(exit.cause);
    expect(message).toContain("RELKIT_INSPECTOR_MISSING");
    expect(message).toContain("relkit add inspector");
  }
});

test("an installed manifest without the bin fails as invalid instead of missing", async () => {
  const root = await application(true);
  await writeFile(
    join(root, "node_modules/@relkit/inspector/package.json"),
    JSON.stringify({ name: "@relkit/inspector", type: "module" }),
  );
  const calls: Array<readonly [readonly string[], string]> = [];
  const exit = await Effect.runPromiseExit(
    runInspectorEffect([], context(root)).pipe(
      Effect.provide(Layer.merge(recordingTerminal(calls), fileSystemLayer)),
    ),
  );
  expect(calls).toEqual([]);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) expect(JSON.stringify(exit.cause)).toContain("RELKIT_INSPECTOR_INVALID");
});
