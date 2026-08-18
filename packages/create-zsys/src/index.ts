#!/usr/bin/env bun
import { generateProject } from "./generate.js";
import { formatGenerateResult } from "./generate-output.js";
import { normalizeCreateOptions } from "./options.js";

export * from "./options.js";
export * from "./validate.js";
export * from "./generate.js";
export * from "./generate-output.js";

if (import.meta.main) {
  try {
    const options = normalizeCreateOptions(process.argv.slice(2));
    const result = await generateProject(options);
    process.stdout.write(
      `${options.json ? JSON.stringify(result) : formatGenerateResult(result)}\n`,
    );
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "ZSYS_CREATE_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    const json = process.argv.includes("--json");
    const output = json
      ? JSON.stringify({ ok: false, error: { code, message } })
      : `${code}: ${message}`;
    (json ? process.stdout : process.stderr).write(`${output}\n`);
    process.exitCode = code === "ZSYS_CREATE_USAGE" ? 2 : 1;
  }
}
