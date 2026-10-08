#!/usr/bin/env bun
import { main } from "./index.js";

if (import.meta.main) process.exitCode = await main();
