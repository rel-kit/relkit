import { resolve } from "node:path";

export interface ParsedJobs {
  readonly path: readonly string[];
  readonly options: Readonly<Record<string, string>>;
  readonly repeated: Readonly<Record<string, readonly string[]>>;
  readonly projectRoot: string;
}

export class JobsCommandError extends Error {
  constructor(
    readonly code:
      "RELKIT_JOBS_USAGE" | "RELKIT_JOBS_REQUEST_FAILED" | "RELKIT_JOB_SUBMISSION_UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "JobsCommandError";
  }
}

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

export function requireOption(parsed: ParsedJobs, name: string, required = true): void {
  if (required && !parsed.options[name]) throw usage(`--${name} is required.`);
}

export function encode(value: string | undefined): string {
  if (!value) throw usage("A locator is required.");
  return encodeURIComponent(value);
}

export function usage(message: string): JobsCommandError {
  return new JobsCommandError("RELKIT_JOBS_USAGE", message);
}
