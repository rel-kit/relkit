import ts from "typescript";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { NORMALIZE_CODES } from "./normalize-types.js";

/** Uses resolved descriptor types, including imported aliases, without executing handlers. */
export function eventSourceDiagnostics(program: ts.Program, projectRoot: string): Diagnostic[] {
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
            const signature = handler && checker.getTypeAtLocation(handler).getCallSignatures()[0];
            if (
              signature &&
              !voidOrError(checker.getReturnTypeOfSignature(signature), checker, handler!)
            ) {
              report(
                handler!,
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
}

function field(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const property = object.properties.find((item) => item.name?.getText() === name);
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : property && ts.isShorthandPropertyAssignment(property)
      ? property.name
      : undefined;
}

function unwrap(value: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(value) ||
    ts.isParenthesizedExpression(value) ||
    ts.isNonNullExpression(value) ||
    ts.isSatisfiesExpression(value)
  )
    value = value.expression;
  return value;
}

function property(
  type: ts.Type,
  key: string,
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Type | undefined {
  const symbol = type.getProperty(key);
  return symbol && checker.getTypeOfSymbolAtLocation(symbol, node);
}

function eventOnly(node: ts.Node, checker: ts.TypeChecker): boolean {
  const mode = property(checker.getTypeAtLocation(node), "invocationMode", checker, node);
  return mode?.isStringLiteral() === true && mode.value === "event-only";
}

function identity(node: ts.Node, checker: ts.TypeChecker): string {
  const id = property(checker.getTypeAtLocation(node), "id", checker, node);
  return id?.isStringLiteral() ? id.value : node.getText();
}

function factoryName(node: ts.Expression, checker: ts.TypeChecker): string {
  let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol?.name ?? node.getText();
}

function voidOrError(type: ts.Type, checker: ts.TypeChecker, node: ts.Node): boolean {
  const result = checker.getAwaitedType(type) ?? type;
  if (result.isUnion()) return result.types.every((part) => voidOrError(part, checker, node));
  if (
    result.flags &
    (ts.TypeFlags.Void |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Never |
      ts.TypeFlags.Any |
      ts.TypeFlags.Unknown)
  )
    return true;
  const effect = property(result, "~effect/Effect", checker, node);
  if (effect) {
    const output = property(effect, "_A", checker, node)?.getCallSignatures()[0];
    return (
      output !== undefined && voidOrError(checker.getReturnTypeOfSignature(output), checker, node)
    );
  }
  // The normal function contract validator checks declared error identity and Effect error channels.
  return (
    (result.getProperty("message") !== undefined && result.getProperty("name") !== undefined) ||
    (property(result, "_tag", checker, node)?.isStringLiteral() === true &&
      checker.typeToString(property(result, "_tag", checker, node)!) === '"FunctionFailure"')
  );
}
