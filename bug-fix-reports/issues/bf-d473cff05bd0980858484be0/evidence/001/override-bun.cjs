#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

writeFileSync(join(__dirname, "override-executed"), "selected");
const result = spawnSync("bun", process.argv.slice(2), { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
