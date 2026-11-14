import { resolve } from "node:path";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { oneShotEnvironment } from "../runtime/one-shot-environment.js";
import { JobsCommandError } from "./jobs-error.js";

/**
 * Pins jobs transport to the existing local loopback host.
 * @param environmentPort - Explicit or native PORT text.
 * @returns The unchanged local URL.
 * @throws JobsCommandError when the existing port contract is invalid.
 */
export function jobsBaseUrl(environmentPort = process.env.PORT): string {
  const port = Number(environmentPort ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new JobsCommandError("RELKIT_JOBS_USAGE", "PORT must be a valid local server port.");
  return `http://127.0.0.1:${port}`;
}

/**
 * Resolves the jobs server URL from the application's environment, so on Node a `PORT` set only
 * in its environment files is used as it is under Bun.
 * @param root - Application root, defaulting to the working directory.
 * @returns Lazily, the local URL; requires CliFileSystem and fails with the PORT usage error.
 */
export const jobsBaseUrlEffect = Effect.fn("Jobs.baseUrl")(function* (root?: string) {
  const environment = yield* oneShotEnvironment(resolve(root ?? process.cwd()));
  return yield* cliTry("jobs.base-url", () => jobsBaseUrl(environment.PORT));
});
