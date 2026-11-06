/**
 * Rule `legacy-jobs`: the function-target `defineJob` from `jobs/legacy` and its queue runtime
 * were removed. A legacy job runs a function with its own retry, schedule and idempotency
 * settings, and the task-backed job that replaces it needs a task whose output and retry
 * policy the developer chooses, so the rule does not invent one: it reports each legacy job
 * with its line. It does rewrite `ctx.jobs.<name>.enqueue(...)` to `.trigger(...)`, the one
 * call that starts a job run, and reports reads of the old `instanceId` result field.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import { applyTextEdits, findingAt, walk, type TextEdit } from "../code-edits.js";
import { namedImports } from "../code-imports.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";

const id = "legacy-jobs";

export const legacyJobsRule: CodeRule = {
  id,
  summary: "Replace legacy function-target jobs with task-backed jobs",
  guide: "legacy-jobs",
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path),
  apply: (file) => {
    const source = parseCodeSource(file.path, file.text);
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    const legacy = new Set(
      namedImports(source, (module) => /(?:^|\/)jobs\/legacy$/.test(module))
        .filter((entry) => entry.imported === "defineJob")
        .map((entry) => entry.local),
    );
    walk(source, (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression))
        if (legacy.has(node.expression.text))
          findings.push(
            findingAt(
              source,
              node,
              id,
              "Legacy defineJob runs a function directly; define a task for its work and export defineJob({ name, task, service }) from relkit/jobs.",
            ),
          );
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "enqueue" &&
        ts.isCallExpression(node.parent) &&
        jobsAccess(node.expression)
      )
        edits.push({ start: node.name.getStart(source), end: node.name.getEnd(), text: "trigger" });
      if (ts.isPropertyAccessExpression(node) && node.name.text === "instanceId" && edits.length)
        findings.push(findingAt(source, node, id, "Job runs report runId instead of instanceId."));
    });
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/**
 * Tells whether an expression is `<something>.jobs.<name>` or `<something>.jobs["name"]`.
 * @param node - Receiver of an `enqueue` access.
 * @returns True for a job handle on a context or runtime handle.
 */
function jobsAccess(node: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const owner = node.expression;
    return ts.isPropertyAccessExpression(owner) && owner.name.text === "jobs";
  }
  return false;
}
