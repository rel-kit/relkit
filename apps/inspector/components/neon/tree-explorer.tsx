/*
 * Adapted from Neon UI SchemaExplorer (https://ui.neon.com/database/schema-explorer), MIT.
 * See public/THIRD_PARTY_NOTICES.txt. Generalized from tables/columns to any group → leaf tree:
 * domains → resources, buckets → objects, environment sources → keys.
 */
"use client";

import { ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  filterTree,
  highlightParts,
  type TreeGroupData,
  type TreeLeafData,
} from "@/lib/tree-filter";

export interface TreeLeaf extends TreeLeafData {
  readonly icon?: ReactNode;
  /** Short token before the label, e.g. an HTTP method chip. */
  readonly lead?: ReactNode;
  /** Right-aligned mono detail, e.g. a kind, size or masked value. */
  readonly detail?: ReactNode;
  readonly badge?: ReactNode;
  readonly href?: string;
}

export interface TreeGroup extends TreeGroupData<TreeLeaf> {
  readonly icon?: ReactNode;
  /** Right-aligned summary, e.g. "4 routes · 2 functions". */
  readonly summary?: ReactNode;
  readonly href?: string;
}

export function TreeExplorer({
  title,
  subtitle,
  icon,
  groups,
  searchLabel,
  emptyLabel = "Nothing matches this search.",
  defaultOpen = [],
  onSelectLeaf,
  selectedLeaf,
  className,
}: {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly icon?: ReactNode;
  readonly groups: readonly TreeGroup[];
  readonly searchLabel: string;
  readonly emptyLabel?: string;
  readonly defaultOpen?: readonly string[];
  readonly onSelectLeaf?: (leaf: TreeLeaf, group: TreeGroup) => void;
  readonly selectedLeaf?: string;
  readonly className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(defaultOpen));
  const filtered = useMemo(() => filterTree(groups, query), [groups, query]);
  const leafCount = filtered.reduce((total, item) => total + item.children.length, 0);
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section
      className={cn(
        "@container min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground",
        className,
      )}
      data-slot="tree-explorer"
    >
      <header className="flex min-h-11 items-center gap-2 border-b border-border px-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center rounded-md bg-live/10 text-live [&_svg]:size-3.5"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="m-0 truncate text-[13px] font-medium">{title}</p>
          {subtitle ? <p className="m-0 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </header>
      <label className="flex h-10 items-center gap-2 border-b border-border px-3 focus-within:ring-2 focus-within:ring-ring/40 focus-within:ring-inset">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchLabel}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {query ? (
          <>
            <span className="text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
              {leafCount} match{leafCount === 1 ? "" : "es"}
            </span>
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </>
        ) : null}
      </label>
      {filtered.length === 0 ? (
        <p className="m-0 px-6 py-10 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="neon-scroll-fade m-0 max-h-[70vh] list-none space-y-0.5 overflow-y-auto p-1.5">
          {filtered.map(({ group, children, matchedInside }) => {
            const expanded = matchedInside || open.has(group.id);
            const groupData = group as TreeGroup;
            return (
              <li key={group.id}>
                <div
                  className="group flex h-9 items-center gap-2 rounded-md px-1.5 hover:bg-muted/50"
                  data-state={expanded ? "open" : "closed"}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
                    onClick={() => toggle(group.id)}
                    className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        "size-3.5 transition-transform duration-150 motion-reduce:transition-none",
                        expanded && "rotate-90",
                      )}
                    />
                  </button>
                  {groupData.icon ? (
                    <span
                      aria-hidden="true"
                      className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground [&_svg]:size-3.5"
                    >
                      {groupData.icon}
                    </span>
                  ) : null}
                  {groupData.href ? (
                    <Link
                      href={groupData.href}
                      className="min-w-0 truncate text-xs font-medium text-foreground no-underline hover:underline"
                    >
                      <Highlighted text={group.label} query={query} />
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate text-xs font-medium">
                      <Highlighted text={group.label} query={query} />
                    </span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                    {groupData.summary ?? `${group.children.length}`}
                  </span>
                </div>
                {expanded ? (
                  <ul className="m-0 ml-[18px] list-none border-l border-border/70 py-0.5 pl-2">
                    {children.map((leaf) => {
                      const content = (
                        <>
                          <span
                            aria-hidden="true"
                            className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/70 [&_svg]:size-3"
                          >
                            {leaf.icon}
                          </span>
                          {leaf.lead ? <span className="shrink-0">{leaf.lead}</span> : null}
                          <code className="min-w-0 truncate bg-transparent p-0 text-xs text-foreground/90">
                            <Highlighted text={leaf.label} query={query} />
                          </code>
                          {leaf.badge}
                          <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
                            {leaf.detail ? (
                              <code className="max-w-48 truncate bg-transparent p-0 text-right text-[11px] text-muted-foreground">
                                {leaf.detail}
                              </code>
                            ) : null}
                          </span>
                        </>
                      );
                      const rowClass = cn(
                        "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left no-underline outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                        selectedLeaf === leaf.id && "bg-muted",
                      );
                      return (
                        <li key={leaf.id}>
                          {leaf.href ? (
                            <Link href={leaf.href} className={rowClass}>
                              {content}
                            </Link>
                          ) : onSelectLeaf ? (
                            <button
                              type="button"
                              className={rowClass}
                              aria-pressed={selectedLeaf === leaf.id}
                              onClick={() => onSelectLeaf(leaf, groupData)}
                            >
                              {content}
                            </button>
                          ) : (
                            <div className={rowClass}>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Highlighted({ text, query }: { readonly text: string; readonly query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-live/20 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
