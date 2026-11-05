/**
 * Runs the ordered codemod rules over a set of project files, purely in memory. Source files
 * go through every rule that applies; Markdown and MDX guidance go through the rules marked
 * `markdown`, one TypeScript code fence at a time, with finding lines mapped back to the
 * document. The result lists only files whose text changed, files rules created, and every
 * finding, which the planner turns into a preview and the transaction into a write.
 */
import type {
  CodeChange,
  CodeFile,
  CodeFinding,
  CodeRule,
  CodeRuleContext,
} from "./code-migration.types.js";

const fence =
  /^([ \t]*)(```|~~~)(ts|tsx|typescript|js|jsx|javascript)\b[^\n]*\n([\s\S]*?)\n\1\2[ \t]*$/gm;

/**
 * Applies every rule to every file.
 * @param files - Authored files with their current text.
 * @param context - Read-only project facts.
 * @param rules - Rules in run order.
 * @returns Changed and created files, and findings sorted by file and line.
 */
export function applyCodeRules(
  files: readonly CodeFile[],
  context: CodeRuleContext,
  rules: readonly CodeRule[],
): { changes: CodeChange[]; findings: CodeFinding[] } {
  const changes: CodeChange[] = [];
  const findings: CodeFinding[] = [];
  const existing = new Set(files.map((file) => file.path));
  for (const file of files) {
    const markdown = /\.mdx?$/.test(file.path);
    const result = markdown
      ? applyToFences(
          file,
          context,
          rules.filter((rule) => rule.markdown === true),
        )
      : applyToSource(file, context, rules);
    findings.push(...result.findings);
    if (result.text !== file.text)
      changes.push({ path: file.path, before: file.text, after: result.text, rules: result.rules });
    for (const created of result.created) {
      if (existing.has(created.path) || changes.some((change) => change.path === created.path)) {
        findings.push({
          file: created.path,
          line: 1,
          rule: created.rule,
          message: "The file this rule creates already exists.",
        });
        continue;
      }
      changes.push({
        path: created.path,
        before: undefined,
        after: created.text,
        rules: [created.rule],
      });
    }
  }
  changes.sort((left, right) => left.path.localeCompare(right.path));
  findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
  return { changes, findings };
}

/**
 * Runs rules over one source file in order, each seeing the previous rule's output.
 * @param file - Source file.
 * @param context - Project facts.
 * @param rules - Rules in run order.
 * @returns Final text, rules that changed it, created files and findings.
 */
function applyToSource(file: CodeFile, context: CodeRuleContext, rules: readonly CodeRule[]) {
  let text = file.text;
  const changed: string[] = [];
  const findings: CodeFinding[] = [];
  const created: (CodeFile & { rule: string })[] = [];
  for (const rule of rules) {
    if (!rule.appliesTo(file.path)) continue;
    const result = rule.apply({ path: file.path, text }, context);
    findings.push(...result.findings);
    for (const entry of result.created ?? []) created.push({ ...entry, rule: rule.id });
    if (result.text !== text || (result.created?.length ?? 0) > 0) changed.push(rule.id);
    text = result.text;
  }
  return { text, rules: changed, findings, created };
}

/**
 * Runs Markdown-safe rules over each TypeScript code fence of a document.
 * @param file - Markdown or MDX document.
 * @param context - Project facts.
 * @param rules - Rules marked `markdown`.
 * @returns The document with rewritten fences and findings at document lines.
 */
function applyToFences(file: CodeFile, context: CodeRuleContext, rules: readonly CodeRule[]) {
  const findings: CodeFinding[] = [];
  const changed = new Set<string>();
  let index = 0;
  const text = file.text.replace(
    fence,
    (
      block: string,
      _indent: string,
      _marker: string,
      language: string,
      body: string,
      offset: number,
    ) => {
      const extension = /x$/.test(language) ? "tsx" : "ts";
      const virtual = `${file.path}.block-${index++}.${extension}`;
      const result = applyToSource({ path: virtual, text: body }, context, rules);
      const firstLine = file.text.slice(0, offset).split("\n").length + 1;
      for (const finding of result.findings)
        findings.push({ ...finding, file: file.path, line: finding.line + firstLine - 1 });
      for (const rule of result.rules) changed.add(rule);
      if (result.text === body) return block;
      // The block is the opening line, the body, then the closing fence line.
      const head = block.slice(0, block.indexOf("\n") + 1);
      return head + result.text + block.slice(head.length + body.length);
    },
  );
  return { text, rules: [...changed], findings, created: [] };
}
