import { resolve } from "node:path";

import { JobsCommandError } from "./jobs-error.js";
import type { ParsedJobs } from "./jobs.types.js";
export { JobsCommandError } from "./jobs-error.js";
export type { ParsedJobs } from "./jobs.types.js";

/**
 * Parses existing literal jobs arguments without native authority.
 * @param args - Original arguments following jobs.
 * @returns Stable paths, single/repeated values and resolved root.
 * @throws JobsCommandError on an absent required flag value.
 */
export function parse(args: readonly string[]): ParsedJobs {
  const path: string[] = [];
  const options: Record<string, string> = {};
  const repeated: Record<string, string[]> = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (!value.startsWith("--")) {
      path.push(value);
      continue;
    }
    const [name, inline] = value.slice(2).split(/=(.*)/s, 2);
    if (name === "tag") {
      const tag = inline ?? args[++index];
      if (tag === undefined) throw usage("--tag requires a value.");
      (repeated.tag ??= []).push(tag);
      continue;
    }
    const next = inline ?? args[++index];
    if (next === undefined || next.startsWith("--")) throw usage(`--${name} requires a value.`);
    options[name!] = next;
  }
  return { path, options, repeated, projectRoot: resolve(options["project-root"] ?? ".") };
}

/**
 * Enforces an existing command-specific required value.
 * @param parsed - Pure normalized arguments.
 * @param name - Required literal flag name.
 * @param required - Whether this command requires the value.
 * @returns Nothing after validation.
 * @throws JobsCommandError with the existing usage diagnostic.
 */
export function requireOption(parsed: ParsedJobs, name: string, required = true): void {
  if (required && !parsed.options[name]) throw usage(`--${name} is required.`);
}

/**
 * Encodes an opaque locator after preserving missing-locator validation.
 * @param value - Existing public locator.
 * @returns URL-encoded locator.
 * @throws JobsCommandError if no locator was supplied.
 */
export function encode(value: string | undefined): string {
  if (!value) throw usage("A locator is required.");
  return encodeURIComponent(value);
}

/**
 * Creates the existing public usage failure.
 * @param message - Existing usage diagnostic.
 * @returns Original public error constructor and code.
 */
export function usage(message: string): JobsCommandError {
  return new JobsCommandError("RELKIT_JOBS_USAGE", message);
}
