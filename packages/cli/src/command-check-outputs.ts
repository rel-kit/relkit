/** Projects a check result's generated files for JSON output: paths and hashes, bodies on request. */
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import { GENERATED_ARTIFACT_FILES } from "./compiler/generated-artifacts.js";
import type { CheckResult } from "./commands/check.js";

/** One generated file as `relkit check --json` reports it. */
export interface CheckOutputSummary {
  /** Project-relative path, absent for an output the check does not write to disk. */
  readonly path?: string;
  /** `sha256:` followed by the lowercase hex digest of the file's UTF-8 bytes. */
  readonly sha256: string;
  /** Size of the file in bytes. */
  readonly bytes: number;
  /** The file's text, present only with `--include-outputs`. */
  readonly content?: string;
}

/** A check result as printed: the same fields, with each generated file summarized. */
export type CheckJsonResult = Omit<CheckResult, "outputs"> & {
  readonly outputs: Readonly<Record<string, CheckOutputSummary>>;
};

/**
 * Replaces each generated file's body with its path, hash and size.
 * @param result - Complete check result, which keeps its bodies for the callers inside the CLI.
 * @param includeContent - Whether each summary also carries the body.
 * @returns The result as printed in JSON mode.
 */
export function checkJsonResult(result: CheckResult, includeContent: boolean): CheckJsonResult {
  const files: Readonly<Record<string, string | undefined>> = GENERATED_ARTIFACT_FILES;
  const outputs: Record<string, CheckOutputSummary> = {};
  for (const [name, content] of Object.entries(result.outputs)) {
    if (typeof content !== "string") continue;
    const file = files[name];
    outputs[name] = {
      ...(file === undefined
        ? {}
        : {
            path: relative(result.projectRoot, join(result.generatedDirectory, file))
              .split(sep)
              .join("/"),
          }),
      sha256: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      bytes: Buffer.byteLength(content),
      ...(includeContent ? { content } : {}),
    };
  }
  return { ...result, outputs };
}
