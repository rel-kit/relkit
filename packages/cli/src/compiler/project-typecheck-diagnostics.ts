/**
 * Converts type diagnostics to RelKit diagnostics: those printed by the project's compiler
 * process for ordinary checks, and those of the in-process private-parser program that prepared
 * checks use, whose input journal must observe every file that decides the result.
 */
import { createDiagnostic, type Diagnostic, type DiagnosticSeverity } from "relkit/diagnostics";
import { isAbsolute, relative, resolve, sep } from "node:path";
import ts from "../typescript-parser.js";
import type { CompilerRun } from "./typescript-compiler.js";

/**
 * Converts one compiler run to RelKit diagnostics.
 * @param run - Outcome of the project's compiler.
 * @param projectRoot - Absolute project root and compiler working directory.
 * @param physicalRoot - Same root after native symlink/canonical-path resolution.
 * @remarks Diagnostics in files outside the project keep their code and message without a location.
 * @returns Compiler diagnostics retaining TypeScript code, severity, message and position.
 */
export function compilerDiagnostics(
  run: CompilerRun,
  projectRoot: string,
  physicalRoot: string,
): readonly Diagnostic[] {
  if (run.kind === "unavailable") return [];
  if (run.kind === "failed")
    return [
      createDiagnostic({
        code: "RELKIT_TYPESCRIPT_COMPILER_FAILED",
        severity: "error",
        message: `The TypeScript compiler exited with code ${run.exitCode} without reporting diagnostics.${run.output === "" ? "" : `\n${run.output}`}`,
      }),
    ];
  return run.diagnostics.map(({ code, severity, message, location }) =>
    located(
      { code, severity, message },
      location === undefined
        ? undefined
        : { ...location, file: resolve(projectRoot, location.file) },
      projectRoot,
      physicalRoot,
    ),
  );
}

/**
 * Converts an in-process TypeScript diagnostic to RelKit evidence.
 * @param diagnostic - Diagnostic of the private-parser program.
 * @param projectRoot - Absolute project root for portable source paths.
 * @param physicalRoot - Same acquired root after native symlink/canonical-path resolution.
 * @returns A compiler diagnostic retaining TypeScript severity, message, and source position.
 */
export function programDiagnostic(
  diagnostic: ts.Diagnostic,
  projectRoot: string,
  physicalRoot: string,
): Diagnostic {
  const position =
    diagnostic.file === undefined || diagnostic.start === undefined
      ? undefined
      : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return located(
    {
      code: `TS${diagnostic.code}`,
      severity: severity(diagnostic.category),
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    },
    position === undefined || diagnostic.file === undefined
      ? undefined
      : { file: diagnostic.file.fileName, line: position.line + 1, column: position.character + 1 },
    projectRoot,
    physicalRoot,
  );
}

/**
 * Attaches a location only when it lies inside the project.
 * @param base - Code, severity and message.
 * @param location - Absolute file and one-based position, when known.
 * @param projectRoot - Absolute project root.
 * @param physicalRoot - Canonical project root.
 * @returns The diagnostic, located when its file is inside either root.
 */
function located(
  base: { readonly code: string; readonly severity: DiagnosticSeverity; readonly message: string },
  location: { readonly file: string; readonly line: number; readonly column: number } | undefined,
  projectRoot: string,
  physicalRoot: string,
): Diagnostic {
  const root =
    location === undefined
      ? undefined
      : [projectRoot, physicalRoot].find((root) => {
          const local = relative(root, location.file);
          return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
        });
  if (location === undefined || root === undefined) return createDiagnostic(base);
  return createDiagnostic({ ...base, ...location }, { projectRoot: root });
}

/**
 * Maps a TypeScript diagnostic category to compiler severity.
 * @param category - TypeScript diagnostic category.
 * @returns The compiler severity corresponding to the TypeScript category.
 */
function severity(category: ts.DiagnosticCategory): DiagnosticSeverity {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  return "info";
}
