#!/usr/bin/env node
/** Package-runner bootstrap; creation runs in this process on Bun or Node. */

const entry = new URL(import.meta.url.endsWith(".ts") ? "./cli.ts" : "./cli.js", import.meta.url);
try {
  const { main } = await import(entry.href);
  await main(process.argv.slice(2));
} catch (cause) {
  process.stderr.write((cause instanceof Error ? cause.message : String(cause)) + "\n");
  process.exitCode = 1;
}
