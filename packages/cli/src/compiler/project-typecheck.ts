/**
 * Runs TypeScript and route/event validation after generated declarations exist.
 * Ordinary checks take type errors from the project's own compiler (`tsc` or `tsgo`, TypeScript
 * 5.9 or 7) run as a separate process. RelKit's own source analyses (route modules, event sources,
 * unused errors) read a program built with the CLI's private TypeScript 5.9 parser, never the
 * project's. Prepared checks supply a scoped input journal that observes the declarations that
 * program consumes and its negative resolution probes; because a separate process escapes that
 * journal, their type errors come from the journal-hosted program itself. A project that installs
 * no TypeScript compiler is type-checked by that program too.
 */
import type { Diagnostic } from "relkit/diagnostics";
import { Effect, Option } from "effect";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "../typescript-parser.js";
import { runCompilerPromise } from "./compatibility.js";
import { eventSourceDiagnosticsEffect } from "./event-source-diagnostics.js";
import { unusedErrorDiagnosticsEffect } from "./unused-error-diagnostics.js";
import { observeCompiler } from "./observability.js";
import { checkConfigPath, routeValidationRoot } from "./project-typecheck-config.js";
import { ROUTE_MODULE_CHECKS_FILE } from "./route-module-checks.js";
import { routeModuleDiagnostics } from "./route-module-diagnostics.js";
import { TypecheckInputs } from "./typecheck-inputs.service.js";
import { runProjectCompilerEffect } from "./typescript-compiler.js";
import { compilerDiagnostics, programDiagnostic } from "./project-typecheck-diagnostics.js";

/**
 * Checks an authored project after generated declarations are available.
 * @param projectRoot - Absolute project root for portable source paths.
 * @param generatedDirectory - Project-relative location of generated route declarations.
 * @param rules - Opt-in check rules from the tooling configuration.
 * @returns A lazy effect that checks an authored project after generated declarations are available; unexpected access failures remain defects.
 */
export const typecheckProjectEffect = Effect.fn("Compiler.typecheckProject")(
  function* (
    projectRoot: string,
    generatedDirectory = ".relkit/generated",
    rules: CheckRules = {},
  ) {
    const configPath = resolve(projectRoot, "tsconfig.json");
    if (!existsSync(configPath)) return [];
    const journal = yield* Effect.serviceOption(TypecheckInputs);
    const system = Option.isSome(journal) ? journal.value.system : ts.sys;
    const physicalRoot = system.realpath?.(projectRoot) ?? projectRoot;
    const loaded = ts.readConfigFile(configPath, system.readFile);
    if (Option.isSome(journal) && loaded.error)
      return [programDiagnostic(loaded.error, projectRoot, physicalRoot)];
    // The project's compiler reports configuration errors itself, with its own option set.
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config ?? {},
      system,
      dirname(configPath),
      { noEmit: true },
      configPath,
    );
    const routeChecks = resolve(projectRoot, generatedDirectory, ROUTE_MODULE_CHECKS_FILE);
    const hasRouteChecks = existsSync(routeChecks);
    const compiler = Option.isSome(journal)
      ? undefined
      : yield* runProjectCompilerEffect(
          projectRoot,
          checkConfigPath(configPath, parsed, hasRouteChecks ? routeChecks : undefined),
        );
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
      ...(rules.unusedErrors === true
        ? yield* unusedErrorDiagnosticsEffect(program, projectRoot)
        : []),
      ...(compiler === undefined || compiler.kind === "unavailable"
        ? [...parsed.errors, ...ts.getPreEmitDiagnostics(program)].map((diagnostic) =>
            programDiagnostic(diagnostic, projectRoot, physicalRoot),
          )
        : compilerDiagnostics(compiler, projectRoot, physicalRoot)),
    ];
  },
  (effect, projectRoot, _generatedDirectory = ".relkit/generated", _rules: CheckRules = {}) =>
    observeCompiler("configuration", "typecheckProject", effect, () => ({})),
);

/**
 * Checks an authored project after generated declarations are available.
 * @param projectRoot - Absolute project root for portable source paths.
 * @param generatedDirectory - Project-relative location of generated route declarations.
 * @param rules - Opt-in check rules from the tooling configuration.
 * @returns Ordered RelKit and TypeScript diagnostics converted to compiler evidence.
 */
export function typecheckProject(
  projectRoot: string,
  generatedDirectory = ".relkit/generated",
  rules: CheckRules = {},
): Promise<readonly Diagnostic[]> {
  return runCompilerPromise(typecheckProjectEffect(projectRoot, generatedDirectory, rules));
}

/** Opt-in check rules; every rule is off unless set. */
export interface CheckRules {
  readonly unusedErrors?: boolean;
}
