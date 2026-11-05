/**
 * Rule `dependency-declarations`: `publishes: ["orders.created"]` is replaced by declaring the
 * event descriptor under `dependencies.events`, and `ctx.events["orders.created"]` becomes
 * `ctx.events.orderCreated`. The rule finds each event's `defineEvent({ id })` in the project,
 * imports its export with a relative path and uses the binding as the context key. An event ID
 * it cannot find leaves the definition unchanged and is reported.
 */
import { posix } from "node:path";
import { codeSyntax as ts, parseCodeSource, type CodeSource } from "../code-parser.js";
import {
  applyTextEdits,
  findingAt,
  literalText,
  objectProperty,
  removeProperty,
  walk,
  type TextEdit,
} from "../code-edits.js";
import { addDefaultImport, addNamedImport } from "../code-imports.js";
import type { CodeFinding, CodeRule, CodeRuleContext } from "../code-migration.types.js";
import {
  dependencyEdits,
  handlerSites,
  needDependency,
  type DependencyPlan,
} from "./handler-context.js";
import { importModule, resolveSource } from "./descriptor-bindings.js";

const id = "dependency-declarations";

export const dependencyDeclarationsRule: CodeRule = {
  id,
  summary: "Declare published events under dependencies.events instead of publishes",
  guide: "dependency-declarations",
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path),
  apply: (file, context) => {
    const source = parseCodeSource(file.path, file.text);
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    const plan: DependencyPlan = new Map();
    const imported = new Set<string>();
    for (const site of handlerSites(source)) {
      const publishes = objectProperty(site.definition.options, "publishes");
      if (publishes === undefined || !ts.isPropertyAssignment(publishes)) continue;
      const list = publishes.initializer;
      const ids = ts.isArrayLiteralExpression(list)
        ? list.elements.map((element) => literalText(element))
        : [];
      const events = ids.map((eventId) =>
        eventId === undefined ? undefined : findEvent(context, eventId),
      );
      const missing = ids.filter(
        (eventId, index) => eventId === undefined || events[index] === undefined,
      );
      if (!ts.isArrayLiteralExpression(list) || missing.length > 0) {
        findings.push(
          findingAt(
            source,
            publishes,
            id,
            `Declare ${missing.length ? missing.map(String).join(", ") : "these events"} under dependencies.events and publish through ctx.events.<name>.`,
          ),
        );
        continue;
      }
      edits.push(removeProperty(source, publishes));
      for (const [index, event] of events.entries()) {
        const local = eventLocal(source, file.path, event!, edits, imported);
        needDependency(plan, site.definition.options, "events", local, local);
        edits.push(...eventAccesses(source, site.handler, site.context, ids[index]!, local));
      }
      if (site.parameterEdit && usesContext(site.handler, site.context))
        edits.push(site.parameterEdit);
    }
    edits.push(...dependencyEdits(source, plan));
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/** Where an event is declared and how its module exports it. */
interface EventExport {
  readonly path: string;
  readonly binding: string;
  readonly isDefault: boolean;
}

/**
 * Finds the module that defines an event ID.
 * @param context - Project sources.
 * @param eventId - Event ID from `publishes`.
 * @returns The defining file and its export, if exactly found.
 */
function findEvent(context: CodeRuleContext, eventId: string): EventExport | undefined {
  for (const [path, text] of context.sources) {
    if (!text.includes(eventId) || !text.includes("defineEvent")) continue;
    const match = new RegExp(
      `(export\\s+)?const\\s+(\\w+)\\s*=\\s*defineEvent\\(\\s*\\{[^}]*?\\bid:\\s*["']${eventId.replace(/\./g, "\\.")}["']`,
      "s",
    ).exec(text);
    if (match === null) continue;
    const binding = match[2]!;
    const isDefault = new RegExp(`export\\s+default\\s+${binding}\\s*;`).test(text);
    if (isDefault || match[1] !== undefined) return { path, binding, isDefault };
  }
  return undefined;
}

/**
 * Imports an event's export into the file, reusing an existing import of the module.
 * @param source - Parsed file.
 * @param from - File path.
 * @param event - Event export.
 * @param edits - Edit collector for the import.
 * @param imported - Modules already imported by this run.
 * @returns The local binding to use.
 */
function eventLocal(
  source: CodeSource,
  from: string,
  event: EventExport,
  edits: TextEdit[],
  imported: Set<string>,
) {
  let module = posix.relative(posix.dirname(from), event.path).replace(/\.tsx?$/, ".js");
  if (!module.startsWith(".")) module = `./${module}`;
  for (const statement of source.statements)
    if (ts.isImportDeclaration(statement) && literalText(statement.moduleSpecifier) === module) {
      const local = event.isDefault
        ? statement.importClause?.name?.text
        : importModule(source, event.binding) === module
          ? event.binding
          : undefined;
      if (local !== undefined) return local;
    }
  if (!imported.has(module)) {
    imported.add(module);
    const edit = event.isDefault
      ? addDefaultImport(source, module, event.binding)
      : addNamedImport(source, module, event.binding);
    if (edit) edits.push(edit);
  }
  return event.binding;
}

/**
 * Rewrites `<ctx>.events["id"]` to `<ctx>.events.<local>` inside a handler.
 * @param source - Parsed file.
 * @param handler - Handler function.
 * @param context - Context parameter name.
 * @param eventId - Event ID.
 * @param local - Context key.
 * @returns Edits for each access.
 */
function eventAccesses(
  source: CodeSource,
  handler: ts.Node,
  context: string,
  eventId: string,
  local: string,
): TextEdit[] {
  const edits: TextEdit[] = [];
  walk(handler, (node) => {
    if (
      ts.isElementAccessExpression(node) &&
      literalText(node.argumentExpression) === eventId &&
      node.expression.getText(source) === `${context}.events`
    )
      edits.push({ start: node.expression.getEnd(), end: node.getEnd(), text: `.${local}` });
  });
  return edits;
}

/**
 * Tells whether a handler reads its context parameter (only then must a missing one be added).
 * @param handler - Handler function.
 * @param context - Context parameter name.
 * @returns Whether the name appears in the body.
 */
function usesContext(handler: ts.FunctionLikeDeclaration, context: string): boolean {
  let used = false;
  if (handler.body)
    walk(handler.body, (node) => {
      if (ts.isIdentifier(node) && node.text === context) used = true;
    });
  return used;
}
