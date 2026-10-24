/** Parses trusted tool launch flags without importing an application's config or dependencies. */
import { resolve } from "node:path";
import { Schema } from "effect";
import { InspectionEndpoint } from "@relkit/inspector-api/connection";
import type { InspectorOptions } from "./options.types.js";

/** Public standalone launch help; tokens are accepted only through private files. */
export const INSPECTOR_HELP = `Usage: relkit-inspector [options]
  --project-root <directory>     Discover running sessions without evaluating the project
  --connection-file <file>       Explicitly select one private session descriptor
  --credential-file <file>       Private descriptor supplying matching session credentials
  --target <http-origin>         Override network routing while verifying original identity
  --history-directory <path>     Persistent project-bound history (default .relkit/observability)
  --hostname <host>              UI bind host (default 127.0.0.1)
  --port <number>                UI port (default 3210)
  --help                        Show this help
`;

/** Validates all launch authority before opening a listener, history or a child. */
export function parseInspectorOptions(args: readonly string[]): InspectorOptions {
  const flags = new Map<string, string>();
  const allowed = new Set([
    "--project-root",
    "--connection-file",
    "--credential-file",
    "--target",
    "--history-directory",
    "--hostname",
    "--port",
  ]);
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!;
    const value = args[i + 1];
    if (!allowed.has(name) || value === undefined || value.startsWith("--") || flags.has(name))
      throw new TypeError(`Invalid standalone inspector option: ${name}`);
    flags.set(name, value);
  }
  const port = Number(flags.get("--port") ?? "3210");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new TypeError("--port must be between 1 and 65535");
  const target = flags.get("--target");
  if (target !== undefined && !Schema.is(InspectionEndpoint)(target))
    throw new TypeError("--target must be an HTTP origin with a valid port");
  const hostname = flags.get("--hostname") ?? "127.0.0.1";
  if (!/^(?:[a-zA-Z0-9.-]+|::1|::)$/.test(hostname)) throw new TypeError("Invalid --hostname");
  return {
    hostname,
    port,
    ...(target === undefined ? {} : { target }),
    ...Object.fromEntries(
      ["project-root", "connection-file", "credential-file", "history-directory"].flatMap(
        (name) => {
          const value = flags.get(`--${name}`);
          const key = {
            "project-root": "projectRoot",
            "connection-file": "connectionFile",
            "credential-file": "credentialFile",
            "history-directory": "historyDirectory",
          }[name]!;
          return value === undefined ? [] : [[key, resolve(value)]];
        },
      ),
    ),
  };
}
