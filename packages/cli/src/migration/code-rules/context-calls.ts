/**
 * Rule `context-calls`: function descriptors lost `.invoke()` and channel descriptors lost
 * `.trigger()` and `.getPresence()`. Inside a handler a call becomes `ctx.functions.<name>(…)`
 * or `ctx.channels.<name>.trigger(…)` and the descriptor is declared under `dependencies`.
 * Outside handlers, `<service>.<member>.invoke(…)` becomes
 * `getRelkit().functions.<serviceId>.<member>(…)`; other call shapes outside handlers are
 * reported. Tool descriptors and graph nodes keep `invoke`, so only receivers that are clearly
 * functions or channels are rewritten: bindings imported from `*.function` / `*.channel`
 * modules or created by `defineFunction` / `defineChannel`, and members of an imported service.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import { applyTextEdits, findingAt, walk, type TextEdit } from "../code-edits.js";
import { addNamedImport, bindingReferences } from "../code-imports.js";
import type { CodeFile, CodeFinding, CodeRule, CodeRuleContext } from "../code-migration.types.js";
import {
  dependencyEdits,
  enclosingHandler,
  handlerSites,
  needDependency,
  type DependencyPlan,
} from "./handler-context.js";
import { classifyReceiver, serviceIdOf } from "./descriptor-bindings.js";

const id = "context-calls";

export const contextCallsRule: CodeRule = {
  id,
  summary:
    "Call functions and channels through ctx or getRelkit() instead of invoke() and trigger()",
  guide: "context-calls",
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path),
  apply: (file, context) => rewriteCalls(file, context),
};

/**
 * Rewrites descriptor calls in one module.
 * @param file - Module.
 * @param context - Project sources, used to read service IDs.
 * @returns New text and findings for calls outside handlers it cannot place.
 */
function rewriteCalls(file: CodeFile, context: CodeRuleContext) {
  const source = parseCodeSource(file.path, file.text);
  const sites = handlerSites(source);
  const plan: DependencyPlan = new Map();
  const edits: TextEdit[] = [];
  const findings: CodeFinding[] = [];
  const parameters = new Set<(typeof sites)[number]>();
  const handled = new Map<string, ts.Node[]>();
  walk(source, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const method = node.expression.name.text;
    if (!["invoke", "trigger", "getPresence"].includes(method)) return;
    const receiver = classifyReceiver(source, file.path, node.expression.expression);
    if (receiver === undefined) return;
    if ((method === "invoke") !== (receiver.kind === "function")) return;
    const site = enclosingHandler(sites, node);
    const receiverText = node.expression.expression.getText(source);
    const span = { start: node.expression.getStart(source), end: node.expression.getEnd() };
    if (site !== undefined) {
      parameters.add(site);
      const group = receiver.kind === "function" ? "functions" : "channels";
      needDependency(plan, site.definition.options, group, receiver.key, receiverText);
      const target = `${site.context}.${group}.${receiver.key}`;
      edits.push({ ...span, text: method === "invoke" ? target : `${target}.${method}` });
      return;
    }
    const serviceId = receiver.service && serviceIdOf(context, file.path, receiver.service.module);
    if (receiver.kind === "function" && receiver.service && serviceId !== undefined) {
      const nodes = handled.get(receiver.service.binding) ?? [];
      handled.set(receiver.service.binding, [...nodes, node.expression.expression]);
      edits.push({ ...span, text: `getRelkit().functions${access(serviceId)}.${receiver.key}` });
      return;
    }
    findings.push(
      findingAt(
        source,
        node,
        id,
        receiver.kind === "function"
          ? `Call ${receiverText} through getRelkit().functions.<service>.<member>(…) or from a handler's ctx.functions.`
          : `Trigger ${receiverText} from a handler's ctx.channels or through getRelkit().channels.`,
      ),
    );
  });
  for (const site of parameters) if (site.parameterEdit) edits.push(site.parameterEdit);
  edits.push(...dependencyEdits(source, plan));
  if (handled.size > 0) {
    const edit = addNamedImport(source, "relkit", "getRelkit");
    if (edit) edits.push(edit);
  }
  edits.push(...unusedServiceImports(source, handled));
  return { text: applyTextEdits(file.text, edits), findings };
}

/**
 * Writes a property access for a handle key.
 * @param key - Service ID.
 * @returns `.key` for identifier-safe keys, else `["key"]`.
 */
function access(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

/**
 * Drops default imports of services whose every reference moved to `getRelkit()`.
 * @param source - Parsed file.
 * @param handled - Service bindings and the receivers rewritten for each.
 * @returns Removal edits for imports nothing reads any more.
 */
function unusedServiceImports(source: ts.SourceFile, handled: ReadonlyMap<string, ts.Node[]>) {
  const edits: TextEdit[] = [];
  for (const [binding, receivers] of handled) {
    const rewritten = (node: ts.Node) =>
      receivers.some((receiver) => receiver.pos <= node.pos && node.end <= receiver.end);
    const remaining = bindingReferences(source, binding).filter(
      (node) => !ts.isImportClause(node.parent) && !rewritten(node),
    );
    if (remaining.length > 0) continue;
    for (const statement of source.statements)
      if (
        ts.isImportDeclaration(statement) &&
        statement.importClause?.name?.text === binding &&
        statement.importClause.namedBindings === undefined
      ) {
        const end =
          source.getFullText()[statement.getEnd()] === "\n"
            ? statement.getEnd() + 1
            : statement.getEnd();
        edits.push({ start: statement.getStart(source), end, text: "" });
      }
  }
  return edits;
}
