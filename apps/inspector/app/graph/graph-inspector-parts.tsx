"use client";

/** Shared building blocks of the Details panel: sections, fact lists, schemas and node links. */
import type { ReactNode } from "react";
import type { GraphNode } from "../../lib/graph-model";
import type { AppHierarchy } from "../../lib/graph-hierarchy";
import { nodeTitle, schemaSummary } from "../../lib/graph-node-meta";
import { CATEGORY_ICONS as icons } from "./graph-nodes";
import { NODE_CATEGORIES, nodeCategory } from "../../lib/graph-semantics";
import { SchemaViewer } from "../schema-panel";

export function Section({
  title,
  children,
  hint,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly hint?: string;
}) {
  return (
    <section className="explorer-section">
      <h3 className="explorer-section__title">
        {title}
        {hint && <span className="explorer-section__hint">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

export function Facts({ items }: { readonly items: readonly (readonly [string, ReactNode])[] }) {
  const visible = items.filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (visible.length === 0) return null;
  return (
    <dl className="explorer-facts">
      {visible.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SchemaDisclosure({
  title,
  schema,
  open,
}: {
  readonly title: string;
  readonly schema: unknown;
  readonly open?: boolean;
}) {
  const summary = schemaSummary(schema);
  return (
    <details className="explorer-schema" open={open}>
      <summary>
        <span>{title}</span>
        <span className="explorer-section__hint">{summary ?? "not declared"}</span>
      </summary>
      <div className="explorer-schema__body">
        <SchemaViewer value={schema} />
      </div>
    </details>
  );
}

export function NodeButton({
  hierarchy,
  id,
  hint,
  onSelect,
}: {
  readonly hierarchy: AppHierarchy;
  readonly id: string;
  readonly hint?: string;
  readonly onSelect: (id: string) => void;
}) {
  const node = hierarchy.nodes.get(id);
  if (node === undefined)
    return (
      <li className="explorer-relation">
        <code>{id}</code>
      </li>
    );
  const category = nodeCategory(node);
  const Icon = icons[category];
  return (
    <li>
      <button
        type="button"
        className="explorer-relation"
        onClick={() => onSelect(id)}
        style={{ "--node-color": `var(${NODE_CATEGORIES[category].token})` } as React.CSSProperties}
      >
        <Icon aria-hidden="true" />
        <span className="explorer-relation__title">{nodeTitle(node)}</span>
        {hint && <span className="explorer-relation__hint">{hint}</span>}
      </button>
    </li>
  );
}

export type DetailProps = {
  readonly hierarchy: AppHierarchy;
  readonly node: GraphNode;
  readonly onSelect: (id: string) => void;
};
