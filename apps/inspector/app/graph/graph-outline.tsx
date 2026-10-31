"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Button, Tree, TreeItem, TreeItemContent, type Key } from "react-aria-components";
import type { GraphNode } from "../../lib/graph-model";
import type { AppHierarchy, DomainGroup } from "../../lib/graph-hierarchy";
import { nodeTitle } from "../../lib/graph-node-meta";
import { NODE_CATEGORIES, type NodeCategory, nodeCategory } from "../../lib/graph-semantics";
import { CATEGORY_ICONS } from "./graph-nodes";

export interface OutlineEntry {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly category?: NodeCategory;
  /** Graph node this row selects; group rows have none. */
  readonly nodeId?: string;
  readonly children?: readonly OutlineEntry[];
}

/** Top-level group keys; `@` keeps them apart from node ids, which start with a letter. */
export const OUTLINE_ROOTS = ["@domains", "@platform"] as const;

export function buildOutline(hierarchy: AppHierarchy, query: string): readonly OutlineEntry[] {
  const needle = query.trim().toLowerCase();
  const matches = (node: GraphNode) =>
    needle === "" ||
    node.id.toLowerCase().includes(needle) ||
    nodeTitle(node).toLowerCase().includes(needle);
  const leaf = (node: GraphNode): OutlineEntry => ({
    key: node.id,
    label: nodeTitle(node),
    category: nodeCategory(node),
    nodeId: node.id,
  });
  const group = (
    key: string,
    label: string,
    nodes: readonly GraphNode[],
  ): OutlineEntry | undefined => {
    const kept = nodes.filter(matches);
    return kept.length === 0
      ? undefined
      : { key, label, hint: String(kept.length), children: kept.map(leaf) };
  };
  const domainEntry = (domain: DomainGroup): OutlineEntry | undefined => {
    const children = [
      group(`${domain.id}/routes`, "Routes", domain.routes),
      group(`${domain.id}/listeners`, "Listeners", domain.listeners),
      group(`${domain.id}/functions`, "Functions", domain.functions),
      group(`${domain.id}/events`, "Events", domain.events),
      group(`${domain.id}/channels`, "Channels", domain.channels),
      group(`${domain.id}/agents`, "Agents", domain.agents),
      group(`${domain.id}/tools`, "Tools", domain.tools),
      group(`${domain.id}/jobs`, "Jobs", domain.jobs),
    ].filter((entry): entry is OutlineEntry => entry !== undefined);
    if (children.length === 0 && !(needle !== "" && domain.id.includes(needle))) return undefined;
    return {
      key: domain.id,
      label: domain.id,
      hint: String(domain.members.length - 1),
      category: "service",
      nodeId: domain.id,
      children,
    };
  };
  const domains = hierarchy.domains
    .map(domainEntry)
    .filter((entry): entry is OutlineEntry => entry !== undefined);
  const platformChildren: OutlineEntry[] = [];
  const { database, auth, tables, routes, providers, env, errors, middleware } = hierarchy.platform;
  if (database !== undefined) {
    const kept = tables.filter(matches);
    if (kept.length > 0 || matches(database))
      platformChildren.push({
        key: database.id,
        label: nodeTitle(database),
        hint: String(tables.length),
        category: "platform",
        nodeId: database.id,
        children: kept.map(leaf),
      });
  }
  if (auth !== undefined && (matches(auth) || routes.some(matches)))
    platformChildren.push({
      key: auth.id,
      label: nodeTitle(auth),
      category: "platform",
      nodeId: auth.id,
      children: routes.filter(matches).map(leaf),
    });
  for (const [key, label, nodes] of [
    ["@platform/providers", "Providers", providers],
    ["@platform/env", "Environment", env],
    ["@platform/errors", "Errors", errors],
    ["@platform/middleware", "Middleware", middleware],
  ] as const) {
    const entry = group(key, label, nodes);
    if (entry !== undefined) platformChildren.push(entry);
  }
  const result: OutlineEntry[] = [
    { key: OUTLINE_ROOTS[0], label: "Domains", hint: String(domains.length), children: domains },
  ];
  if (platformChildren.length > 0)
    result.push({ key: OUTLINE_ROOTS[1], label: "Platform", children: platformChildren });
  return result;
}

/** Keys of every ancestor group of a node, so the tree can reveal it. */
export function outlinePathTo(entries: readonly OutlineEntry[], nodeId: string): readonly string[] {
  const walk = (
    list: readonly OutlineEntry[],
    trail: readonly string[],
  ): readonly string[] | undefined => {
    for (const entry of list) {
      if (entry.nodeId === nodeId) return trail;
      if (entry.children !== undefined) {
        const found = walk(entry.children, [...trail, entry.key]);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return walk(entries, []) ?? [];
}

export function allGroupKeys(entries: readonly OutlineEntry[]): readonly string[] {
  return entries.flatMap((entry) =>
    entry.children === undefined ? [] : [entry.key, ...allGroupKeys(entry.children)],
  );
}

export function GraphOutline({
  entries,
  selectedId,
  expandedKeys,
  onExpandedChange,
  onSelect,
}: {
  readonly entries: readonly OutlineEntry[];
  readonly selectedId: string | undefined;
  readonly expandedKeys: ReadonlySet<string>;
  readonly onExpandedChange: (keys: ReadonlySet<string>) => void;
  readonly onSelect: (nodeId: string) => void;
}) {
  const byKey = useMemo(() => {
    const map = new Map<string, OutlineEntry>();
    const walk = (list: readonly OutlineEntry[]) => {
      for (const entry of list) {
        map.set(entry.key, entry);
        if (entry.children) walk(entry.children);
      }
    };
    walk(entries);
    return map;
  }, [entries]);
  return (
    <Tree
      aria-label="Application outline"
      className="explorer-tree"
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection={false}
      selectedKeys={selectedId === undefined ? new Set<Key>() : new Set<Key>([selectedId])}
      onSelectionChange={(keys) => {
        if (keys === "all") return;
        const [key] = [...keys];
        if (key === undefined) return;
        const entry = byKey.get(String(key));
        if (entry?.nodeId !== undefined) onSelect(entry.nodeId);
        else if (entry !== undefined) {
          const next = new Set(expandedKeys);
          if (next.has(entry.key)) next.delete(entry.key);
          else next.add(entry.key);
          onExpandedChange(next);
        }
      }}
      expandedKeys={expandedKeys as Set<Key>}
      onExpandedChange={(keys) => onExpandedChange(new Set([...keys].map(String)))}
      renderEmptyState={() => <p className="explorer-tree__empty">Nothing matches.</p>}
    >
      {entries.map((entry) => (
        <OutlineRow key={entry.key} entry={entry} />
      ))}
    </Tree>
  );
}

function OutlineRow({ entry }: { readonly entry: OutlineEntry }) {
  const Icon = entry.category === undefined ? undefined : CATEGORY_ICONS[entry.category];
  const hasChildren = entry.children !== undefined && entry.children.length > 0;
  return (
    <TreeItem
      id={entry.key}
      textValue={entry.label}
      className="explorer-tree__item"
      hasChildItems={hasChildren}
    >
      <TreeItemContent>
        {({ isExpanded, hasChildItems, level }) => (
          <div
            className="explorer-tree__row"
            data-level={level}
            data-kind={entry.nodeId === undefined ? "group" : "node"}
            style={
              {
                "--level": level,
                ...(entry.category === undefined
                  ? {}
                  : { "--node-color": `var(${NODE_CATEGORIES[entry.category].token})` }),
              } as React.CSSProperties
            }
          >
            {hasChildItems ? (
              <Button slot="chevron" className="explorer-tree__chevron" aria-label="Toggle">
                <ChevronRight aria-hidden="true" data-expanded={isExpanded ? "true" : undefined} />
              </Button>
            ) : (
              <span className="explorer-tree__chevron" aria-hidden="true" />
            )}
            {Icon && <Icon aria-hidden="true" className="explorer-tree__icon" />}
            <span className="explorer-tree__label">{entry.label}</span>
            {entry.hint && <span className="explorer-tree__hint">{entry.hint}</span>}
          </div>
        )}
      </TreeItemContent>
      {entry.children?.map((child) => (
        <OutlineRow key={child.key} entry={child} />
      ))}
    </TreeItem>
  );
}
