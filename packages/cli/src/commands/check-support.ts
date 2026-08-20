import { canonicalJson, ZSYS_DESCRIPTOR } from "@zsys/contracts";
import { createDiagnostic, type Diagnostic } from "@zsys/diagnostics";
import { ConfigValidationError, type GeneratedOutputs } from "@zsys/compiler";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";

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

export function conventionDescriptor(kind: string, id: string): object {
  return { [ZSYS_DESCRIPTOR]: true, kind, id, ref: { kind, id } };
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Check was aborted.");
}

export function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith("/") ? root : `${root}/`);
}

export function safeMessage(error: unknown, projectRoot?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return projectRoot === undefined ? message : message.replaceAll(projectRoot, "<project>");
}

export function emptyCheckOutputs(diagnostics: readonly Diagnostic[]): GeneratedOutputs {
  return {
    graph: "",
    manifest: "",
    diagnostics: `${canonicalJson(diagnostics)}\n`,
    openapi: "",
    client: "",
  };
}

export async function checkFailureDiagnostics(
  error: unknown,
  projectRoot: string,
  configPath: string,
): Promise<readonly Diagnostic[]> {
  if (!(error instanceof ConfigValidationError)) {
    return [
      createDiagnostic({
        code: "ZSYS_CHECK_FAILED",
        severity: "error",
        message: safeMessage(error, projectRoot),
      }),
    ];
  }
  const source = await readFile(configPath, "utf8").catch(() => "");
  const file = relative(projectRoot, configPath).replaceAll("\\", "/");
  return error.issues.map((issue) => {
    const key = issue.path.split(/[.[]/, 1)[0] ?? issue.path;
    const location = locateKey(source, key);
    return createDiagnostic({
      code: issue.code,
      severity: "error",
      message: `${issue.message} Example: export default defineConfig({ server: { port: 3000 }, inspector: { port: 3210 } });`,
      file,
      ...location,
    });
  });
}

function locateKey(
  source: string,
  key: string,
): { readonly line: number; readonly column: number } {
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(key));
  if (index < 0) return { line: 1, column: 1 };
  return { line: index + 1, column: Math.max(1, lines[index]!.indexOf(key) + 1) };
}
