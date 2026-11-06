/**
 * Shared editing for rules that move calls onto the handler context: find the `handler` of a
 * `defineFunction`/`defineTask`/`defineEventFunction` call, make sure it has a context
 * parameter, and add entries under `dependencies.<group>` of its options. Each rule collects
 * its needs into a `DependencyPlan` and emits one edit per options object, so several calls
 * in one handler produce one declaration.
 */
import { codeSyntax as ts, type CodeSource } from "../code-parser.js";
import { indentOf, objectProperty, walk, type TextEdit } from "../code-edits.js";
import { relkitLocalsOf, type DefineCall, defineCalls } from "./rule-support.js";

/** Definitions whose handlers receive `ctx` with declared dependencies. */
const handlerDefinitions = ["defineFunction", "defineTask", "defineEventFunction"];

/** A handler function inside a definition, and how to name its context parameter. */
export interface HandlerSite {
  readonly definition: DefineCall;
  readonly handler: ts.FunctionLikeDeclaration;
  readonly context: string;
  readonly parameterEdit?: TextEdit;
}

/**
 * Lists every definition handler in a file with its context parameter name.
 * @param source - Parsed file.
 * @returns Handler sites; `parameterEdit` is set when the parameter must be added.
 */
export function handlerSites(source: CodeSource): HandlerSite[] {
  const sites: HandlerSite[] = [];
  for (const definition of defineCalls(source, relkitLocalsOf(source, handlerDefinitions))) {
    const property = objectProperty(definition.options, "handler");
    let handler: ts.FunctionLikeDeclaration | undefined;
    if (property && ts.isPropertyAssignment(property)) {
      const value = property.initializer;
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) handler = value;
    }
    for (const member of definition.options.properties)
      if (ts.isMethodDeclaration(member) && member.name.getText(source) === "handler")
        handler = member;
    if (handler !== undefined)
      sites.push({ definition, handler, ...contextParameter(source, handler) });
  }
  return sites;
}

/**
 * Finds the innermost handler that contains a node.
 * @param sites - Handler sites of the file.
 * @param node - Call site.
 * @returns The handler, if the node is inside one.
 */
export function enclosingHandler(sites: readonly HandlerSite[], node: ts.Node) {
  return sites
    .filter((site) => site.handler.pos <= node.pos && node.end <= site.handler.end)
    .sort(
      (left, right) =>
        left.handler.end - left.handler.pos - (right.handler.end - right.handler.pos),
    )[0];
}

/**
 * Names the handler's context parameter, planning to add one when it is missing.
 * @param source - Parsed file.
 * @param handler - Handler function.
 * @returns The parameter name and, if needed, the edit that declares it.
 */
function contextParameter(source: CodeSource, handler: ts.FunctionLikeDeclaration) {
  const [input, second] = handler.parameters;
  if (second !== undefined && ts.isIdentifier(second.name)) return { context: second.name.text };
  let used = false;
  walk(handler, (node) => {
    if (ts.isIdentifier(node) && node.text === "context") used = true;
  });
  const context = used ? "relkitContext" : "context";
  if (input !== undefined)
    return {
      context,
      parameterEdit: { start: input.getEnd(), end: input.getEnd(), text: `, ${context}` },
    };
  const open = handler
    .getChildren(source)
    .find((child) => child.kind === ts.SyntaxKind.OpenParenToken);
  const offset = open === undefined ? handler.getStart(source) : open.getEnd();
  return { context, parameterEdit: { start: offset, end: offset, text: `_input, ${context}` } };
}

/** Dependency entries to add, per definition options object and group. */
export type DependencyPlan = Map<ts.ObjectLiteralExpression, Map<string, Map<string, string>>>;

/**
 * Records that a definition needs `dependencies.<group>.<key>: <value>`.
 * @param plan - Plan being collected.
 * @param options - Definition options object.
 * @param group - Dependency group such as `functions`.
 * @param key - Context key.
 * @param value - Expression text; equal to `key` writes a shorthand entry.
 * @returns Nothing.
 */
export function needDependency(
  plan: DependencyPlan,
  options: ts.ObjectLiteralExpression,
  group: string,
  key: string,
  value: string,
): void {
  const groups = plan.get(options) ?? new Map<string, Map<string, string>>();
  const entries = groups.get(group) ?? new Map<string, string>();
  entries.set(key, value);
  groups.set(group, entries);
  plan.set(options, groups);
}

/**
 * Emits the edits that declare every planned dependency, skipping existing entries.
 * @param source - Parsed file.
 * @param plan - Collected needs.
 * @returns Insertion edits, one per new group or entry list.
 */
export function dependencyEdits(source: CodeSource, plan: DependencyPlan): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const [options, groups] of plan) {
    const existing = objectProperty(options, "dependencies");
    const declared =
      existing &&
      ts.isPropertyAssignment(existing) &&
      ts.isObjectLiteralExpression(existing.initializer)
        ? existing.initializer
        : undefined;
    const fresh: string[] = [];
    for (const [group, entries] of groups) {
      const current = declared && objectProperty(declared, group);
      const object =
        current &&
        ts.isPropertyAssignment(current) &&
        ts.isObjectLiteralExpression(current.initializer)
          ? current.initializer
          : undefined;
      const missing = [...entries].filter(([key]) => !object || !objectProperty(object, key));
      if (missing.length === 0) continue;
      const text = missing.map(([key, value]) => (key === value ? key : `${key}: ${value}`));
      if (object !== undefined) edits.push(appendTo(source, object, text.join(", ")));
      else fresh.push(`${group}: { ${text.join(", ")} }`);
    }
    if (fresh.length === 0) continue;
    if (declared !== undefined) edits.push(appendTo(source, declared, fresh.join(", ")));
    else edits.push(beforeHandler(source, options, `dependencies: { ${fresh.join(", ")} }`));
  }
  return edits;
}

/**
 * Appends entries after an object's last property, or fills an empty object.
 * @param source - Parsed file.
 * @param object - Object literal.
 * @param text - Entry text without surrounding commas.
 * @returns The insertion edit.
 */
function appendTo(source: CodeSource, object: ts.ObjectLiteralExpression, text: string): TextEdit {
  const last = object.properties[object.properties.length - 1];
  if (last === undefined)
    return { start: object.getStart(source), end: object.getEnd(), text: `{ ${text} }` };
  return { start: last.getEnd(), end: last.getEnd(), text: `, ${text}` };
}

/**
 * Inserts an options property on its own line before `handler` (or at the end).
 * @param source - Parsed file.
 * @param options - Definition options.
 * @param text - Property text without a trailing comma.
 * @returns The insertion edit.
 */
function beforeHandler(
  source: CodeSource,
  options: ts.ObjectLiteralExpression,
  text: string,
): TextEdit {
  const handler = options.properties.find(
    (property) => property.name?.getText(source) === "handler",
  );
  if (handler !== undefined) {
    const start = handler.getStart(source);
    return { start, end: start, text: `${text},\n${indentOf(source, handler)}` };
  }
  return appendTo(source, options, text);
}
