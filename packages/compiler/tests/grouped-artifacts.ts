/** Checks paired generated public contracts and native context imports while retaining real grouped source provenance. */
import assert from "node:assert/strict";
import * as ts from "typescript";
import { generateContextRegistry } from "../src/context-registry.js";
import type { FixtureCompilation } from "../../../tests/compiler/fixture-runner.js";

/**
 * Compares generated client/API contracts and declared resource context bindings after a source-only move.
 * @param before - Real flat fixture compilation.
 * @param after - Real grouped fixture compilation.
 * @returns Completion or an assertion defect naming the changed public artifact.
 */
export function assertGroupedArtifacts(
  before: FixtureCompilation,
  after: FixtureCompilation,
): void {
  for (const key of [
    "openapi",
    "client",
    "contract",
    "clientRegistry",
    "clientManifest",
    "clientContract",
  ] as const) {
    const left = before.normalization.outputs[key].replaceAll(before.graphHash, "<graph-hash>");
    const right = after.normalization.outputs[key].replaceAll(after.graphHash, "<graph-hash>");
    assert.equal(right, left, key + " changed across a source-only move");
  }
  const leftContext = generateContextRegistry(before.extracted, {
    projectRoot: before.temporaryRoot,
  });
  const rightContext = generateContextRegistry(after.extracted, {
    projectRoot: after.temporaryRoot,
  });
  assert.equal(portableContext(rightContext), leftContext, "context binding contracts changed");
  for (const descriptor of after.normalization.descriptors) {
    const previous = before.normalization.references.get(descriptor.id);
    if (previous === undefined || !previous.source.file.startsWith("src/")) continue;
    if (descriptor.source.file.startsWith("src/services/"))
      assert.equal(
        descriptor.source.file.replace(/^src\/services\//, "src/"),
        previous.source.file,
      );
  }
}

/**
 * Normalizes only generated TypeScript import-type specifiers for known grouped service roots.
 * @param source - Exact generated context declaration text.
 * @returns Flat-equivalent import provenance without touching schemas, route paths or ordinary literals.
 */
function portableContext(source: string): string {
  const file = ts.createSourceFile("context-registry.d.ts", source, ts.ScriptTarget.Latest, true);
  const edits: ts.TextChange[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      const literal = node.argument.literal;
      if (literal.text.startsWith("../../src/services/"))
        edits.push({
          span: { start: literal.getStart(file) + 1, length: literal.getWidth(file) - 2 },
          newText: literal.text.replace("../../src/services/", "../../src/"),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const edit of edits.reverse())
    source =
      source.slice(0, edit.span.start) +
      edit.newText +
      source.slice(edit.span.start + edit.span.length);
  return source;
}
