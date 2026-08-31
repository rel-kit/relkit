import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createDiagnostic, type Diagnostic, type DiagnosticSeverity } from "@relkit/diagnostics";
import ts from "typescript";
import { eventSourceDiagnostics } from "./event-source-diagnostics.js";

/** Type-checks a project with its own tsconfig after generated declarations exist. */
export function typecheckProject(projectRoot: string): readonly Diagnostic[] {
  const configPath = resolve(projectRoot, "tsconfig.json");
  if (!existsSync(configPath)) return [];

  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) return [typescriptDiagnostic(loaded.error, projectRoot)];

  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    dirname(configPath),
    {
      noEmit: true,
    },
    configPath,
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    ...(parsed.projectReferences ? { projectReferences: parsed.projectReferences } : {}),
  });
  return [
    ...eventSourceDiagnostics(program, projectRoot),
    ...[...parsed.errors, ...ts.getPreEmitDiagnostics(program)].map((diagnostic) =>
      typescriptDiagnostic(diagnostic, projectRoot),
    ),
  ];
}

function typescriptDiagnostic(diagnostic: ts.Diagnostic, projectRoot: string): Diagnostic {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) {
    return createDiagnostic({
      code: `TS${diagnostic.code}`,
      severity: severity(diagnostic.category),
      message,
    });
  }
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return createDiagnostic(
    {
      code: `TS${diagnostic.code}`,
      severity: severity(diagnostic.category),
      message,
      file: diagnostic.file.fileName,
      line: location.line + 1,
      column: location.character + 1,
    },
    { projectRoot },
  );
}

function severity(category: ts.DiagnosticCategory): DiagnosticSeverity {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  return "info";
}
