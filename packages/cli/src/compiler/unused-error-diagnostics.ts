/**
 * The opt-in `check.unusedErrors` rule: reports a declared error that a function's handler never
 * mentions. Handlers may throw or return declared errors, so type checking no longer requires
 * every declared error to be raised; this rule restores that check for teams that want it.
 */
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";
import { Effect } from "effect";
import ts from "typescript";
import { factoryName, field, unwrap } from "./event-source-diagnostics-support.js";
import { NORMALIZE_CODES } from "./normalize-types.js";

/**
 * Finds declared errors that a function's handler never mentions.
 * @param program - TypeScript program containing the authored functions.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns A lazy effect yielding one warning per unused declared error.
 */
export const unusedErrorDiagnosticsEffect = Effect.fn("Compiler.unusedErrorDiagnostics")(function* (
  program: ts.Program,
  projectRoot: string,
) {
  const checker = program.getTypeChecker();
  const diagnostics: Diagnostic[] = [];
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || source.fileName.includes("/node_modules/")) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = factoryName(node.expression, checker);
        const options = node.arguments[0] && unwrap(node.arguments[0]);
        if (
          (name === "defineFunction" || name === "defineEventFunction") &&
          options !== undefined &&
          ts.isObjectLiteralExpression(options)
        )
          diagnostics.push(...unusedErrors(options, source, checker, projectRoot));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return diagnostics;
});

/** Reports the declared errors one function's handler never mentions. */
function unusedErrors(
  options: ts.ObjectLiteralExpression,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  projectRoot: string,
): Diagnostic[] {
  const errors = field(options, "errors");
  const handler = field(options, "handler");
  if (errors === undefined || handler === undefined) return [];
  const list = unwrap(errors);
  if (!ts.isArrayLiteralExpression(list)) return [];
  const mentioned = new Set<ts.Symbol>();
  const collect = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const symbol = resolved(checker.getSymbolAtLocation(node), checker);
      if (symbol !== undefined) mentioned.add(symbol);
    }
    ts.forEachChild(node, collect);
  };
  collect(handler);
  const id = field(options, "id")?.getText(source) ?? "function";
  return list.elements.flatMap((element) => {
    const symbol = resolved(checker.getSymbolAtLocation(unwrap(element)), checker);
    if (symbol === undefined || mentioned.has(symbol)) return [];
    const point = source.getLineAndCharacterOfPosition(element.getStart(source));
    return [
      createDiagnostic(
        {
          code: NORMALIZE_CODES.unusedError,
          severity: "warning",
          message: `Function ${id} declares error ${element.getText(source)}, but its handler never raises it.`,
          suggestion:
            "Throw or return the error from the handler, or remove it from the function's errors.",
          file: source.fileName,
          line: point.line + 1,
          column: point.character + 1,
        },
        { projectRoot },
      ),
    ];
  });
}

/** Follows import aliases to the declared symbol. */
function resolved(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): ts.Symbol | undefined {
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}
