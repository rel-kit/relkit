"use client";

/** The grouped list of everything a node is connected to, worded from that node's side. */
import type { GraphEdge, GraphNode } from "../../lib/graph-model";
import { type AppHierarchy, edgesOf } from "../../lib/graph-hierarchy";
import { isListener } from "../../lib/graph-node-meta";
import { edgeReverseVerb, edgeVerb } from "../../lib/graph-semantics";
import { NodeButton, Section } from "./graph-inspector-parts";

interface RelationGroup {
  readonly title: string;
  readonly items: readonly { readonly id: string; readonly hint?: string }[];
}

function relationGroups(hierarchy: AppHierarchy, node: GraphNode): readonly RelationGroup[] {
  const groups = new Map<string, Map<string, string | undefined>>();
  const add = (title: string, id: string, hint?: string) => {
    const list = groups.get(title) ?? new Map<string, string | undefined>();
    if (!list.has(id)) list.set(id, hint);
    groups.set(title, list);
  };
  for (const edge of edgesOf(hierarchy, node.id)) {
    if (edge.kind.startsWith("exposes-") && edge.kind !== "exposes-as-tool") {
      if (edge.from === node.id) add("Contains", edge.to);
      else add("Belongs to", edge.from);
      continue;
    }
    if (edge.from === node.id) add(capitalize(verbFor(edge, node)), edge.to, hintFor(edge));
    else add(capitalize(reverseVerbFor(edge, node)), edge.from, hintFor(edge));
  }
  return [...groups.entries()].map(([title, items]) => ({
    title,
    items: [...items.entries()].map(([id, hint]) => ({
      id,
      ...(hint === undefined ? {} : { hint }),
    })),
  }));
}

function verbFor(edge: GraphEdge, node: GraphNode): string {
  if (edge.kind === "uses-table")
    return edge.access === "write" ? "writes" : edge.access === "read" ? "reads" : "uses";
  if (edge.kind === "targets-function") return isListener(node) ? "runs" : "handled by";
  return edgeVerb(edge);
}

function reverseVerbFor(edge: GraphEdge, node: GraphNode): string {
  if (edge.kind === "targets-function") {
    const trigger = edge.from;
    return trigger.startsWith("relkit.event.") ? "wakes on" : "handles";
  }
  if (edge.kind === "listens-to-event") return "wakes";
  if (edge.kind === "uses-table" && node.kind === "table")
    return edge.access === "write" ? "written by" : edge.access === "read" ? "read by" : "used by";
  return edgeReverseVerb(edge);
}

function hintFor(edge: GraphEdge): string | undefined {
  if (edge.kind === "uses-table" && edge.table !== undefined) return edge.table;
  return undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function Relations({
  hierarchy,
  node,
  onSelect,
  exclude = [],
}: {
  readonly hierarchy: AppHierarchy;
  readonly node: GraphNode;
  readonly onSelect: (id: string) => void;
  readonly exclude?: readonly string[];
}) {
  const groups = relationGroups(hierarchy, node).filter((group) => !exclude.includes(group.title));
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((group) => (
        <Section key={group.title} title={group.title} hint={String(group.items.length)}>
          <ul className="explorer-relations">
            {group.items.map((item) => (
              <NodeButton
                key={item.id}
                hierarchy={hierarchy}
                id={item.id}
                onSelect={onSelect}
                {...(item.hint === undefined ? {} : { hint: item.hint })}
              />
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}
