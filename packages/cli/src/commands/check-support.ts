import { canonicalJson, RELKIT_DESCRIPTOR } from "@relkit/contracts";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { ConfigValidationError, type GeneratedOutputs } from "@relkit/compiler";
import { Effect } from "effect";
import { relative } from "node:path";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";

/** Projects evaluator evidence into compiler diagnostics with source locations.
 * @param failures - Complete evaluator evidence.
 * @returns Compiler diagnostics preserving optional source locations and existing message projection.
 */
export function evaluatorDiagnostics(
  failures: readonly {
    readonly code: string;
    readonly message: string;
    readonly module?: string;
  }[],
): readonly Diagnostic[] {
  return failures.map((failure) =>
    createDiagnostic({
      code: failure.code,
      severity: "error",
      message: safeMessage(failure.message),
      ...(failure.module === undefined ? {} : { file: failure.module, line: 1, column: 1 }),
    }),
  );
}

/** Constructs the declaration descriptor used by convention evaluation.
 * @param kind - Compiler convention kind.
 * @param id - Accepted declaration identity.
 * @returns The existing synthetic descriptor for convention evaluation.
 */
export function conventionDescriptor(kind: string, id: string): object {
  return { [RELKIT_DESCRIPTOR]: true, kind, id, ref: { kind, id } };
}

/** Preserves the original cancellation reason at the synchronous compatibility edge.
 * @param signal - Optional existing public cancellation.
 * @returns No value while active.
 * @throws The original abort reason at this retained synchronous edge.
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Check was aborted.");
}

/** Checks project containment at path segment boundaries.
 * @param root - Normalized project root.
 * @param target - Normalized source path.
 * @returns Whether the path is root-contained at a segment boundary.
 */
export function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith("/") ? root : `${root}/`);
}

/** Redacts project paths from an expected failure's diagnostic text.
 * @param error - Expected native/configuration failure.
 * @param projectRoot - Optional authored path to redact.
 * @returns Existing portable public diagnostic text.
 */
export function safeMessage(error: unknown, projectRoot?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return projectRoot === undefined ? message : message.replaceAll(projectRoot, "<project>");
}

/** Constructs the complete empty artifact cohort for an unsuccessful check.
 * @param diagnostics - Accepted unsuccessful check evidence.
 * @returns The complete empty artifact cohort with canonical diagnostic bytes.
 */
export function emptyCheckOutputs(diagnostics: readonly Diagnostic[]): GeneratedOutputs {
  return {
    graph: "",
    manifest: "",
    runtimeActivation: "",
    runtimeIntegrations: "",
    runtimeIntegrationImports: "",
    localServices: "",
    diagnostics: `${canonicalJson(diagnostics)}\n`,
    openapi: "",
    client: "",
    contract: "",
    clientContract: "",
    clientRegistry: "",
    clientManifest: "",
  };
}

/**
 * Locates expected configuration issues without recovering defects or interruption.
 * @param error - Expected native or configuration failure.
 * @param projectRoot - Authored project root used for portable messages.
 * @param configPath - Configuration source path.
 * @returns Lazy diagnostics requiring only filesystem reads.
 */
export const checkFailureDiagnosticsEffect = Effect.fn("Project.failureDiagnostics")(
  function* (error: unknown, projectRoot: string, configPath: string) {
    if (!(error instanceof ConfigValidationError)) {
      return [
        createDiagnostic({
          code: "RELKIT_CHECK_FAILED",
          severity: "error",
          message: safeMessage(error, projectRoot),
        }),
      ];
    }
    const files = yield* CliFileSystem;
    const source = yield* files
      .readText(configPath)
      .pipe(Effect.catchTag("CliAdapterError", () => Effect.succeed("")));
    const file = relative(projectRoot, configPath).replaceAll("\\", "/");
    return error.issues.map((issue) => {
      const key = issue.path.split(/[.[]/, 1)[0] ?? issue.path;
      const location = locateKey(source, key);
      return createDiagnostic({
        code: issue.code,
        severity: "error",
        message: `${issue.message} Example: export default defineApp({ env: defineEnv({}), server: { port: 3000 }, inspector: { port: 3210 } });`,
        file,
        ...location,
      });
    });
  },
  (effect, _error: unknown, _projectRoot: string, _configPath: string) =>
    observeCli("project.failureDiagnostics", effect),
);

/**
 * Reports expected configuration failures at the public Promise edge.
 * @param error - Expected configuration or adapter failure.
 * @param projectRoot - Authored project root.
 * @param configPath - Configuration source path.
 * @returns Portable diagnostics after the source-read scope closes.
 */
export function checkFailureDiagnostics(
  error: unknown,
  projectRoot: string,
  configPath: string,
): Promise<readonly Diagnostic[]> {
  return runCliEffect(
    checkFailureDiagnosticsEffect(error, projectRoot, configPath),
    fileSystemLayer,
  );
}

/** Locates an invalid configuration key for best-effort authored source diagnostics.
 * @param source - Authored configuration bytes.
 * @param key - Declared invalid field.
 * @returns Existing one-based best-effort source location.
 */
function locateKey(
  source: string,
  key: string,
): { readonly line: number; readonly column: number } {
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(key));
  if (index < 0) return { line: 1, column: 1 };
  return { line: index + 1, column: Math.max(1, lines[index]!.indexOf(key) + 1) };
}
