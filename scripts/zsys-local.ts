#!/usr/bin/env bun
import { watch, type FSWatcher } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const packages = join(root, "packages");
const cli = join(packages, "cli/src/local.ts");
const frameworkFiles = /^(?:[^/]+\/(?:src\/|package\.json$|tsconfig\.json$))/;
const rootFiles = new Set(["tsconfig.json", "tsconfig.base.json", "turbo.json"]);

type CommandResult = Readonly<{
  exitCode: number;
  output: string;
}>;

async function syncPackages(): Promise<CommandResult> {
  const child = Bun.spawn(
    [
      process.execPath,
      "x",
      "turbo",
      "run",
      "typecheck",
      "--filter=./packages/*",
      "--output-logs=errors-only",
      "--no-update-notifier",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {
    exitCode,
    output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
  };
}

function startCli(args: readonly string[]) {
  return Bun.spawn([process.execPath, cli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}

function reportFailure(result: CommandResult): void {
  if (result.output) process.stderr.write(`${result.output}\n`);
}

async function runWatched(args: readonly string[]): Promise<number> {
  let current = startCli(args);
  let stopped = false;
  let restarting = false;
  let syncing = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish!: (exitCode: number) => void;
  const completed = new Promise<number>((resolve) => {
    finish = resolve;
  });
  const stopWithError = (error: unknown): void => {
    if (stopped) return;
    process.stderr.write(`Local framework watcher failed: ${String(error)}\n`);
    stopped = true;
    current.kill();
    finish(1);
  };

  const observe = (child: typeof current) => {
    void child.exited.then((exitCode) => {
      if (child !== current || restarting || stopped) return;
      stopped = true;
      finish(exitCode);
    });
  };
  observe(current);

  const restart = async (): Promise<void> => {
    restarting = true;
    const previous = current;
    previous.kill();
    await previous.exited;
    if (!stopped) {
      current = startCli(args);
      observe(current);
    }
    restarting = false;
  };

  const refresh = async (): Promise<void> => {
    if (syncing || stopped) return;
    syncing = true;
    try {
      while (pending && !stopped) {
        pending = false;
        process.stderr.write("Framework changed; syncing local packages...\n");
        const result = await syncPackages();
        if (pending || stopped) continue;
        if (result.exitCode !== 0) {
          reportFailure(result);
          process.stderr.write("Framework sync failed; keeping the current dev session.\n");
          continue;
        }
        process.stderr.write("Framework synced; restarting dev.\n");
        await restart();
      }
    } finally {
      syncing = false;
    }
  };

  const schedule = (): void => {
    pending = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh().catch(stopWithError);
    }, 75);
  };
  const watchers: FSWatcher[] = [
    watch(packages, { recursive: true }, (_event, file) => {
      if (file !== null && frameworkFiles.test(file.toString().replaceAll("\\", "/"))) schedule();
    }),
    watch(root, (_event, file) => {
      if (file !== null && rootFiles.has(file.toString())) schedule();
    }),
  ];
  for (const watcher of watchers) watcher.on("error", stopWithError);

  try {
    return await completed;
  } finally {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    current.kill();
  }
}

async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const result = await syncPackages();
  if (result.exitCode !== 0) {
    reportFailure(result);
    return result.exitCode;
  }
  const command = args.find((argument) => !argument.startsWith("-"));
  return command === "dev" ? runWatched(args) : startCli(args).exited;
}

if (import.meta.main) process.exitCode = await main();
