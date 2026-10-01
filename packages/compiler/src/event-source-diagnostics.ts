import {
  unwrap,
  eventOnly,
  identity,
  factoryName,
  field,
  voidOrError,
} from "./event-source-diagnostics-support.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import ts from "typescript";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { NORMALIZE_CODES } from "./normalize-types.js";

/**
 * Checks event-only function signatures in a TypeScript program.
 * @param program - TypeScript program containing authored event-only function declarations.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns A lazy effect that checks event-only function signatures in a TypeScript program; unexpected access failures remain defects.
 */
export const eventSourceDiagnosticsEffect = Effect.fn("Compiler.eventSourceDiagnostics")(
  function* (program: ts.Program, projectRoot: string) {
    const checker = program.getTypeChecker();
    const diagnostics: Diagnostic[] = [];
    for (const source of program.getSourceFiles()) {
      if (source.isDeclarationFile || source.fileName.includes("/node_modules/")) continue;
      const report = (node: ts.Node, code: string, message: string, suggestion: string): void => {
        const point = source.getLineAndCharacterOfPosition(node.getStart(source));
        diagnostics.push(
          createDiagnostic(
            {
              code,
              severity: "error",
              message,
              suggestion,
              file: source.fileName,
              line: point.line + 1,
              column: point.character + 1,
            },
            { projectRoot },
          ),
        );
      };
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          if (
            ts.isPropertyAccessExpression(expression) &&
            ["invoke", "asTool"].includes(expression.name.text)
          ) {
            const target = unwrap(expression.expression);
            if (eventOnly(target, checker))
              report(
                expression,
                NORMALIZE_CODES.eventOnlyTarget,
                `Event-only function "${identity(target, checker)}" cannot use .${expression.name.text}().`,
                "Publish its event, or target a callable defineFunction instead.",
              );
          }
          const name = factoryName(expression, checker);
          const options = node.arguments[0] && unwrap(node.arguments[0]);
          if (options && ts.isObjectLiteralExpression(options)) {
            const id = field(options, "id")?.getText(source) ?? name;
            if (name === "defineEventFunction") {
              for (const key of ["input", "output", "tool", "trigger"]) {
                const invalid = field(options, key);
                if (invalid)
                  report(
                    invalid,
                    NORMALIZE_CODES.eventFunctionOption,
                    `Event function ${id} cannot declare ${key}.`,
                    "Remove the option; input comes from the event and successful output is void.",
                  );
              }
              const handler = field(options, "handler");
              const signature =
                handler && checker.getTypeAtLocation(handler).getCallSignatures()[0];
              if (
                signature &&
                handler !== undefined &&
                !voidOrError(checker.getReturnTypeOfSignature(signature), checker, handler)
              ) {
                report(
                  handler,
                  NORMALIZE_CODES.eventFunctionResult,
                  `Event function ${id} has a non-void successful handler result.`,
                  "Return void on success; use declared errors for failures.",
                );
              }
            }
            if (name === "defineFunction" || name === "defineEventFunction") {
              const publishes = field(options, "publishes");
              if (publishes && ts.isArrayLiteralExpression(unwrap(publishes))) {
                const seen = new Set<string>();
                for (const entry of (unwrap(publishes) as ts.ArrayLiteralExpression).elements) {
                  if (!ts.isStringLiteralLike(entry)) continue;
                  if (seen.has(entry.text))
                    report(
                      entry,
                      NORMALIZE_CODES.publishesDuplicate,
                      `Function ${id} publishes event "${entry.text}" more than once.`,
                      `Remove the duplicate "${entry.text}" entry.`,
                    );
                  seen.add(entry.text);
                }
              }
            }
            if (
              ["defineRoute", "defineJob", "defineTool", "defineService", "defineAgent"].includes(
                name,
              )
            ) {
              const check = (item: ts.Node): void => {
                if (ts.isPropertyAssignment(item)) {
                  check(item.initializer);
                  return;
                }
                if (ts.isExpression(item) && eventOnly(unwrap(item), checker)) {
                  report(
                    item,
                    NORMALIZE_CODES.eventOnlyTarget,
                    `${name} ${id} cannot target event-only function "${identity(unwrap(item), checker)}".`,
                    "Target a callable defineFunction instead.",
                  );
                  return;
                }
                ts.forEachChild(item, check);
              };
              check(options);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return diagnostics;
  },
  (effect, program, projectRoot) =>
    observeCompiler("generation", "eventSourceDiagnostics", effect, () => ({
      files: program
        .getSourceFiles()
        .filter(
          (source) => !source.isDeclarationFile && !source.fileName.includes("/node_modules/"),
        ).length,
    })),
);

/**
 * Checks event-only function signatures in a TypeScript program.
 * @param program - TypeScript program containing authored event-only function declarations.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns Diagnostics for invalid event-only function signatures.
 */
export function eventSourceDiagnostics(program: ts.Program, projectRoot: string): Diagnostic[] {
  return runCompilerSync(eventSourceDiagnosticsEffect(program, projectRoot));
}
