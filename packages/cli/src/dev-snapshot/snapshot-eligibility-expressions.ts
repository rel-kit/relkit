/**
 * Validates declarative descriptor/schema expressions without executing source.
 * Only imported approved constructors may run during preparation; ambient reads,
 * dynamic properties and construction callbacks reject snapshot eligibility.
 */
import ts from "typescript";
import { isLiteralSnapshotDefault } from "./snapshot-default-eligibility.js";

const schemaMethods = new Set([
  "string",
  "number",
  "boolean",
  "literal",
  "enum",
  "object",
  "array",
  "tuple",
  "record",
  "union",
  "optional",
  "nullable",
  "default",
  "min",
  "max",
  "int",
  "positive",
  "nonnegative",
  "email",
  "url",
  "uuid",
  "datetime",
  "strict",
]);

const descriptorFactories = new Set([
  "defineAgent",
  "defineApp",
  "defineEnv",
  "defineFunction",
  "defineGraph",
  "defineGraphNode",
  "defineJob",
  "defineRoute",
  "defineService",
  "defineServiceRoutes",
  "defineTask",
]);

const providerFactories = new Set(["localAgentState", "localRealtime"]);
const constructors = new Set(["FakeToolCallingModel", "MemorySaver", "StateSchema"]);
const deferredProperties = new Set(["edges", "handler"]);

/**
 * Verifies a literal/descriptor/schema expression without executing callbacks.
 * @param expression - Initializer or constructor argument in the parsed input.
 * @param bindings - Proven imported pure authoring names.
 * @returns Completion for a supported pure expression.
 * @throws Error for dynamic evaluation, unaudited calls or callbacks during construction.
 */
export function assertPureExpression(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, string>,
): void {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      expression.kind,
    )
  )
    return;
  if (ts.isIdentifier(expression)) {
    if (expression.text === "undefined" || bindings.has(expression.text)) return;
    throw new Error("Ambient compilation input");
  }
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  )
    return assertPureExpression(expression.expression, bindings);
  if (ts.isPropertyAccessExpression(expression))
    return assertPureExpression(expression.expression, bindings);
  if (ts.isArrayLiteralExpression(expression)) {
    for (const element of expression.elements) assertPureExpression(element, bindings);
    return;
  }
  if (ts.isObjectLiteralExpression(expression)) {
    assertPureObject(expression, bindings);
    return;
  }
  if (ts.isCallExpression(expression)) {
    assertPureCall(expression, bindings);
    return;
  }
  if (ts.isNewExpression(expression)) {
    if (
      !ts.isIdentifier(expression.expression) ||
      !constructors.has(bindings.get(expression.expression.text) ?? "")
    )
      throw new Error("Unaudited construction");
    for (const argument of expression.arguments ?? []) assertPureExpression(argument, bindings);
    return;
  }
  throw new Error("Dynamic compilation expression");
}

/**
 * Accepts only data properties and runtime handler callbacks in descriptor literals.
 * @param expression - Literal descriptor/config/schema data.
 * @param bindings - Proven imported constructors.
 * @returns Completion when every property remains declarative.
 * @throws Error for getters, spreads or compilation-time callback evaluation.
 */
function assertPureObject(
  expression: ts.ObjectLiteralExpression,
  bindings: ReadonlyMap<string, string>,
): void {
  for (const property of expression.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      assertPureExpression(property.name, bindings);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) throw new Error("Effectful object property");
    const name =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : "";
    if (name === "" || name === "__proto__") throw new Error("Dynamic property identity");
    if (
      deferredProperties.has(name) &&
      (ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer))
    )
      continue;
    assertPureExpression(property.initializer, bindings);
  }
}

/**
 * Restricts calls to the exact known factory or an approved env/schema chain.
 * @param expression - Candidate top-level call.
 * @param bindings - Imported names with known pure construction semantics.
 * @returns Completion for an approved call, leaving argument validation to its caller.
 * @throws Error for unaudited calls, dynamic schema methods or indirect constructors.
 */
function assertPureCall(
  expression: ts.CallExpression,
  bindings: ReadonlyMap<string, string>,
): void {
  const target = expression.expression;
  if (ts.isIdentifier(target)) {
    const binding = bindings.get(target.text) ?? "";
    if (descriptorFactories.has(binding)) {
      if (expression.arguments.length === 0) throw new Error("Missing descriptor");
      if (binding === "defineApp") assertCapturedConfiguration(expression.arguments[0]!);
      for (const argument of expression.arguments) assertPureExpression(argument, bindings);
      return;
    }
    if (providerFactories.has(binding)) {
      if (expression.arguments.length > 1) throw new Error("Invalid provider construction");
      for (const argument of expression.arguments) assertPureExpression(argument, bindings);
      return;
    }
    if (binding === "todoListMiddleware") {
      if (expression.arguments.length !== 0) throw new Error("Invalid middleware construction");
      return;
    }
    if (binding === "tool") {
      const [handler, options, ...extra] = expression.arguments;
      if (
        extra.length !== 0 ||
        handler === undefined ||
        (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) ||
        options === undefined
      )
        throw new Error("Invalid tool construction");
      assertPureExpression(options, bindings);
      return;
    }
  }
  if (
    ts.isPropertyAccessExpression(target) &&
    target.name.text === "asTool" &&
    ts.isIdentifier(target.expression) &&
    bindings.get(target.expression.text) === "local" &&
    expression.arguments.length === 1
  ) {
    assertPureExpression(expression.arguments[0]!, bindings);
    return;
  }
  if (!ts.isPropertyAccessExpression(target) || !schemaMethods.has(target.name.text))
    throw new Error("Unaudited call");
  if (target.name.text === "default" && !expression.arguments.every(isLiteralSnapshotDefault))
    throw new Error("Dynamic schema default");
  let receiver = target.expression;
  while (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression))
    receiver = receiver.expression.expression;
  if (!ts.isIdentifier(receiver) || !["z", "env"].includes(bindings.get(receiver.text) ?? ""))
    throw new Error("Unaudited schema root");
  assertPureExpression(target.expression, bindings);
  for (const argument of expression.arguments) assertPureExpression(argument, bindings);
}

/**
 * Limits cached configuration to generated backend fields whose inputs are audited.
 * @param configuration - Direct defineApp literal after factory binding validation.
 * @returns Completion when no discovery or external compilation policy is introduced.
 * @throws Error for uncaptured config fields or computed property identities.
 */
function assertCapturedConfiguration(configuration: ts.Expression): void {
  if (
    !ts.isObjectLiteralExpression(configuration) ||
    configuration.properties.some((property) => {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
        return true;
      const name = property.name;
      return (
        (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) ||
        ![
          "agent-state",
          "defaults",
          "env",
          "id",
          "inspector",
          "realtime",
          "server",
          "telemetry",
        ].includes(name.text)
      );
    })
  )
    throw new Error("Uncaptured compilation configuration");
}
