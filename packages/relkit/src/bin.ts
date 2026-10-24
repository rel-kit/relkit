#!/usr/bin/env bun
/** Dispatches the lightweight public wrapper to pure creation or a compatible project-owned CLI. */
import { main } from "./index.js";
process.exitCode = await main();
