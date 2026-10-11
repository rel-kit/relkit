/**
 * Runs TypeScript and route/event validation after generated declarations exist.
 * Ordinary checks retain the native host. Prepared checks can supply a scoped
 * input journal that observes consumed declarations and negative resolution probes
 * without repeating the check or changing the compiler's diagnostic conversion.
 */
import { createDiagnostic, type Diagnostic, type DiagnosticSeverity } from "@relkit/diagnostics";
import { Effect, Option } from "effect";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { runCompilerSync } from "./compatibility.js";
import { eventSourceDiagnosticsEffect } from "./event-source-diagnostics.js";
import { observeCompiler } from "./observability.js";
import { ROUTE_MODULE_CHECKS_FILE } from "./route-module-checks.js";
import { routeModuleDiagnostics } from "./route-module-diagnostics.js";
import { TypecheckInputs } from "./typecheck-inputs.service.js";

/**
 * Checks an authored project after generated declarations are available.
 * @param projectRoot - Absolute project root for portable source paths.
 * @param generatedDirectory - Project-relative location of generated route declarations.
 * @returns A lazy effect that checks an authored project after generated declarations are available; unexpected access failures remain defects.
 */
export const typecheckProjectEffect = Effect.fn("Compiler.typecheckProject")(
  function* (projectRoot: string, generatedDirectory = ".relkit/generated") {
    const configPath = resolve(projectRoot, "tsconfig.json");
    if (!existsSync(configPath)) return [];
    const journal = yield* Effect.serviceOption(TypecheckInputs);
    const system = Option.isSome(journal) ? journal.value.system : ts.sys;
    const loaded = ts.readConfigFile(configPath, system.readFile);
    if (loaded.error) return [typescriptDiagnostic(loaded.error, projectRoot)];

    const parsed = ts.parseJsonConfigFileContent(
      loaded.config,
      system,
      dirname(configPath),
      {
        noEmit: true,
      },
      configPath,
    );
    const routeChecks = resolve(projectRoot, generatedDirectory, ROUTE_MODULE_CHECKS_FILE);
    const hasRouteChecks = existsSync(routeChecks);
    const options = { ...parsed.options };
    if (hasRouteChecks && options.rootDir !== undefined)
      options.rootDir = routeValidationRoot(options.rootDir, routeChecks);
    const program = ts.createProgram({
      rootNames: [...parsed.fileNames, ...(hasRouteChecks ? [routeChecks] : [])],
      options,
      ...(Option.isSome(journal) ? { host: journal.value.host(options) } : {}),
      ...(parsed.projectReferences ? { projectReferences: parsed.projectReferences } : {}),
    });
    return [
      ...program
        .getSourceFiles()
        .flatMap((source) => routeModuleDiagnostics(program, source, projectRoot)),
      ...(yield* eventSourceDiagnosticsEffect(program, projectRoot)),
      ...[...parsed.errors, ...ts.getPreEmitDiagnostics(program)].map((diagnostic) =>
        typescriptDiagnostic(diagnostic, projectRoot),
      ),
    ];
  },
  (effect, projectRoot, _generatedDirectory = ".relkit/generated") =>
    observeCompiler("configuration", "typecheckProject", effect, () => ({})),
);

/**
 * Checks an authored project after generated declarations are available.
 * @param projectRoot - Absolute project root for portable source paths.
 * @param generatedDirectory - Project-relative location of generated route declarations.
 * @returns Ordered TypeScript diagnostics converted to compiler evidence.
 */
export function typecheckProject(
  projectRoot: string,
  generatedDirectory = ".relkit/generated",
): readonly Diagnostic[] {
  return runCompilerSync(typecheckProjectEffect(projectRoot, generatedDirectory));
}

/**
 * Widens only the no-emit validation root to include generated TypeScript assertions.
 * @param rootDir - Authored validation root.
 * @param routeChecks - Generated route assertion file requiring the same validation.
 * @returns A shared ancestor root without changing emitted production source paths.
 */
function routeValidationRoot(rootDir: string, routeChecks: string): string {
  for (;;) {
    const path = relative(rootDir, routeChecks);
    if (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) return rootDir;
    const parent = dirname(rootDir);
    if (parent === rootDir) return rootDir;
    rootDir = parent;
  }
}

/**
 * Converts a TypeScript diagnostic to portable compiler evidence.
 * @param diagnostic - Compiler diagnostic whose source or severity is inspected.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns A compiler diagnostic retaining TypeScript severity, message, and source position.
 */
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

/**
 * Maps a TypeScript diagnostic category to compiler severity.
 * @param category - TypeScript diagnostic category or dependency group.
 * @returns The compiler severity corresponding to the TypeScript category.
 */
function severity(category: ts.DiagnosticCategory): DiagnosticSeverity {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  return "info";
}
