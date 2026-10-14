/**
 * Reads effective TypeScript resolution settings, including extends and aliases,
 * through the caller's native or journaled System. This adapter never builds a
 * program or imports application code; malformed configuration stays a typed failure.
 */
import { Data, Effect } from "effect";
import { resolve } from "node:path";
import * as ts from "typescript";
import { observeCompiler } from "./observability.js";

/** Module resolution cannot safely proceed with unreadable/invalid project options. */
export class SourceResolutionError extends Data.TaggedError("Compiler.SourceResolutionError")<{
  /** Canonical project root whose TypeScript configuration must be repaired. */
  readonly root: string;
  /** Safe configuration explanation; excludes application runtime values. */
  readonly reason: string;
  /** Normalized native/config failure retained for debugging at the owning boundary. */
  readonly cause: Error;
}> {}

/**
 * Loads inherited options while leaving input-file validation to project typecheck.
 * @param root - Canonical application root containing tsconfig.json when present.
 * @param system - Native or prepared-input-journal System supplied by the owner.
 * @returns Lazy effective options, or SourceResolutionError; no live resource activation.
 */
export const sourceResolutionOptionsEffect = Effect.fn("Compiler.sourceResolutionOptions")(
  function* (root: string, system: ts.System) {
    const path = resolve(root, "tsconfig.json");
    const loaded = yield* Effect.try({
      try: () => {
        if (!system.fileExists(path)) return { options: {} };
        const config = ts.readConfigFile(path, system.readFile);
        if (config.error) return { errors: [config.error] };
        const parsed = ts.parseJsonConfigFileContent(config.config, system, root, {}, path);
        // Root-file validation is separate; virtual source fixtures need no native input list.
        const errors = parsed.errors.filter((error) => error.code !== 18003);
        return { options: parsed.options, errors };
      },
      catch: (cause) =>
        new SourceResolutionError({
          root,
          reason: "Could not read TypeScript configuration",
          cause: new Error("TypeScript configuration read failed", { cause }),
        }),
    });
    if (loaded.errors?.length) {
      const reason = loaded.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
        .join("\n");
      return yield* new SourceResolutionError({ root, reason, cause: new Error(reason) });
    }
    return loaded.options ?? {};
  },
  (effect) => observeCompiler("configuration", "sourceResolutionOptions", effect),
);
