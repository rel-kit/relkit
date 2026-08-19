#!/usr/bin/env bun
export * from "./commands/dev.js";
export * from "./main.js";

import { main } from "./main.js";

if (import.meta.main) process.exitCode = await main();
