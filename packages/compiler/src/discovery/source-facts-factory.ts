import * as ts from "typescript";
import type {
  FactoryBindingFact,
  FactoryIdPresence,
  ServiceMemberFact,
  SourceFactoryKind,
} from "./source-facts-types.js";

interface FactoryDefinition {
  readonly kind: SourceFactoryKind;
  readonly idOptional: boolean;
}

const FACTORIES: Readonly<Record<string, FactoryDefinition>> = Object.freeze({
  defineApp: { kind: "app", idOptional: false },
  defineFunction: { kind: "function", idOptional: true },
  defineError: { kind: "error", idOptional: true },
  defineRoute: { kind: "route", idOptional: true },
  defineJob: { kind: "job", idOptional: false },
  defineEvent: { kind: "event", idOptional: false },
  onEvent: { kind: "event-trigger", idOptional: false },
  defineBucket: { kind: "bucket", idOptional: false },
  defineCache: { kind: "cache", idOptional: false },
  defineTool: { kind: "tool", idOptional: true },
  defineAgent: { kind: "agent", idOptional: true },
  defineMiddleware: { kind: "middleware", idOptional: true },
  defineService: { kind: "service", idOptional: true },
  defineServiceMiddleware: { kind: "service-middleware", idOptional: true },
  defineTransform: { kind: "transform", idOptional: true },
  defineRequestTransform: { kind: "transform", idOptional: true },
});

export function factoryFor(
  initializer: ts.Expression | undefined,
  binding: string | undefined,
  position: number,
): FactoryBindingFact | undefined {
  const call = unwrap(initializer);
  if (!call || !ts.isCallExpression(call)) return undefined;
  const factory = lastSegment(call.expression);
  const definition = factory === undefined ? undefined : FACTORIES[factory];
  if (definition === undefined || factory === undefined) return undefined;
  return Object.freeze({
    ...(binding === undefined ? {} : { binding }),
    factory,
    kind: definition.kind,
    idOptional: definition.idOptional,
    id: idPresence(call.arguments[0]),
    position,
  });
}

export function membersFor(
  factory: FactoryBindingFact,
  initializer: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): readonly ServiceMemberFact[] {
  if (factory.kind !== "service" || factory.binding === undefined) return [];
  const call = unwrap(initializer);
  const options = call && ts.isCallExpression(call) ? unwrap(call.arguments[0]) : undefined;
  if (!options || !ts.isObjectLiteralExpression(options)) return [];
  const functions = options.properties.find(
    (property) => propertyName(property.name) === "functions",
  );
  if (!functions || !ts.isPropertyAssignment(functions)) return [];
  const map = unwrap(functions.initializer);
  if (!map || !ts.isObjectLiteralExpression(map)) return [];
  return map.properties.flatMap((property) => {
    const member = propertyName(property.name);
    if (member === undefined || ts.isSpreadAssignment(property)) return [];
    const targetBinding = memberTarget(property);
    return [
      Object.freeze({
        service: factory.binding!,
        member,
        ...(targetBinding === undefined ? {} : { targetBinding }),
        position: property.name?.getStart(sourceFile) ?? property.getStart(sourceFile),
      }),
    ];
  });
}

function memberTarget(property: ts.ObjectLiteralElementLike): string | undefined {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)
    ? property.initializer.text
    : undefined;
}

function idPresence(argument: ts.Expression | undefined): FactoryIdPresence {
  const value = unwrap(argument);
  if (!value || !ts.isObjectLiteralExpression(value)) return "unknown";
  return value.properties.some((property) => propertyName(property.name) === "id")
    ? "explicit"
    : "omitted";
}

function propertyName(name: ts.PropertyName | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function lastSegment(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  let current = value;
  while (
    current !== undefined &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}
