/** Reads environment variables from `process.env`, which Bun and Node both provide. */
import type { RuntimeEnvironment } from "./runtime-adapter.types.js";

/** Environment access for runtimes that expose `process.env`. */
export const processEnvironment: RuntimeEnvironment = Object.freeze({
  get: (name: string) => process.env[name],
  snapshot: () =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
    ),
});
