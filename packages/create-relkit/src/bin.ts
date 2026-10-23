#!/usr/bin/env node
/** Package-runner bootstrap; application generation always executes under Bun. */

import { fileURLToPath } from "node:url";
import { launchBun } from "./launcher.js";

const entry = new URL(import.meta.url.endsWith(".ts") ? "./cli.ts" : "./cli.js", import.meta.url);
try {
  if (process.versions.bun) {
    const { main } = await import(entry.href);
    await main(process.argv.slice(2));
  } else process.exitCode = await launchBun(fileURLToPath(entry), process.argv.slice(2));
} catch (cause) {
  process.stderr.write((cause instanceof Error ? cause.message : String(cause)) + "\n");
  process.exitCode = 1;
}
