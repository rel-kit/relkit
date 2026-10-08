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
