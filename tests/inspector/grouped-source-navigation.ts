/** Verifies Inspector consumes actual compiler provenance without inferring current or historical source paths from logical identities. */
import assert from "node:assert/strict";
import { sourceLabel, sourceLink } from "../../apps/inspector/lib/source-links.js";
import type { NormalizedGraph } from "../../packages/compiler/src/normalize-graph-types.js";

/**
 * Checks current grouped editor paths and preserves honest historical flat metadata independently of source scanning.
 * @param before - Actual flat compiler graph retained as historical provenance.
 * @param after - Actual grouped compiler graph.
 * @returns Completion after all moved native nodes retain precise current and historical source labels.
 */
export function assertGroupedSourceNavigation(
  before: NormalizedGraph,
  after: NormalizedGraph,
): void {
  const editor = {
    mode: "development",
    editor: "vscode",
    backendUrl: "http://127.0.0.1:3000",
  } as const;
  for (const current of after.nodes.filter((node) =>
    node.source.file.startsWith("src/services/"),
  )) {
    const historical = before.nodes.find(
      (node) => node.kind === current.kind && node.id === current.id,
    );
    assert.ok(historical, "A moved native node must retain its historical logical identity");
    assert.equal(current.domainId, historical.domainId);
    const path = current.source.file.split("/").map(encodeURIComponent).join("/");
    assert.equal(
      sourceLink(current.source, editor),
      `vscode://file/${path}:${current.source.line}:${current.source.column}`,
    );
    assert.equal(
      sourceLabel(current.source),
      `${current.source.file}:${current.source.line}:${current.source.column}`,
    );
    assert.ok(!historical.source.file.startsWith("src/services/"));
    assert.equal(
      sourceLabel(historical.source),
      `${historical.source.file}:${historical.source.line}:${historical.source.column}`,
    );
  }
  assert.equal(sourceLabel(undefined), "Source unavailable");
  assert.equal(sourceLink(undefined, editor), undefined);
  assert.equal(sourceLink(after.nodes[0]?.source, { ...editor, mode: "production" }), undefined);
}
