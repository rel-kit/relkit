#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export * from "./commands/dev.js";
export * from "./main.js";

import { main } from "./main.js";

async function run(): Promise<number> {
  const root = resolve(import.meta.dir, "../../..");
  const launcher = join(root, "scripts/zsys-local.ts");
  const cwd = relative(root, process.cwd()).replaceAll("\\", "/");
  const workspace = cwd === "" || /^(?:apps|examples|packages)(?:\/|$)/.test(cwd);
  if (!existsSync(launcher) || workspace) return main();
  return Bun.spawn([process.execPath, launcher, ...process.argv.slice(2)], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).exited;
}

if (import.meta.main) process.exitCode = await run();
