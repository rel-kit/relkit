import { resolve } from "node:path";
import { Effect, Schema } from "effect";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { cliTry } from "../cli-errors.js";
import { JobsManifestSchema } from "./jobs.schemas.js";
import type { JobsManifestView } from "./jobs.types.js";

/**
 * Reads one existing application-owned JSON input without asserting a domain type.
 * @param projectRoot - Explicit project root.
 * @param path - Existing caller-authorized relative or absolute input path.
 * @returns Untrusted parsed JSON requiring the consumer's protocol validation.
 */
export const readJobsJsonFileEffect = Effect.fn("Jobs.json-file")(
  function* (projectRoot: string, path: string) {
    const files = yield* CliFileSystem;
    const text = yield* files.readText(resolve(projectRoot, path));
    const value: unknown = yield* cliTry("jobs.input-json", () => JSON.parse(text));
    return value;
  },
  (effect) => observeCli("jobs.input-file.workflow", effect),
);

/**
 * Reads the optional compiler-owned manifest with the existing fallback behavior.
 * @param root - Explicit project root.
 * @returns The accepted projection, or undefined for absent/unreadable/invalid JSON.
 */
export const readJobsManifestEffect = Effect.fn("Jobs.manifest")(
  function* (root: string) {
    return yield* readJobsJsonFileEffect(root, ".relkit/generated/jobs.manifest.json").pipe(
      Effect.map((value): JobsManifestView | undefined =>
        Schema.is(JobsManifestSchema)(value) ? value : undefined,
      ),
      Effect.catchTag("CliAdapterError", () => Effect.succeed(undefined)),
    );
  },
  (effect) => observeCli("jobs.manifest.workflow", effect),
);
