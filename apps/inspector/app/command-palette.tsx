"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../components/ui/button";
import { OverlayDialog } from "../components/ui/dialog";
import { ComboboxField } from "../components/ui/select";
import { entityIndex, searchEntities } from "../lib/graph-index";
import type { GraphSnapshot } from "../lib/graph-model";
import { navigation } from "./navigation-data";

interface PaletteResult {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly group: string;
}

export function CommandPalette({
  isOpen,
  onOpenChange,
  graph,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly graph?: GraphSnapshot | undefined;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const entities = useMemo(() => entityIndex(graph), [graph]);
  const results = useMemo<readonly PaletteResult[]>(() => {
    const needle = query.trim().toLowerCase();
    const pages = navigation
      .filter((item) => !item.external)
      .filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(needle))
      .map((item) => ({
        id: item.href,
        label: item.label,
        description: item.group,
        group: "Pages",
      }));
    const found = searchEntities(entities, query).map((entry) => ({
      id: entry.href,
      label: entry.label,
      description: entry.detail,
      group: entry.kind,
    }));
    return [...pages, ...found];
  }, [entities, query]);
  const groups = useMemo(() => {
    const map = new Map<string, PaletteResult[]>();
    for (const result of results) map.set(result.group, [...(map.get(result.group) ?? []), result]);
    return [...map.entries()];
  }, [results]);
  const navigate = (href: string): void => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };
  return (
    <OverlayDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      trigger={
        <Button variant="secondary" className="command-trigger" aria-label="Search inspector">
          <Search aria-hidden="true" />
          <span className="hidden text-muted-foreground sm:inline">Search</span>
          <kbd className="ml-2 hidden rounded border border-border bg-muted px-1 font-sans text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </Button>
      }
      title="Search inspector"
      description="Jump to a page, route, function, job, event, agent or tool."
    >
      <ComboboxField
        label="Destination"
        items={results.map(({ id, label, description }) => ({ id, label, description }))}
        value={query}
        onChange={setQuery}
        onSelect={navigate}
      />
      <div className="neon-scroll-fade mt-3 max-h-[52vh] overflow-y-auto">
        {groups.map(([group, items]) => (
          <section key={group} className="mb-2">
            <h3 className="m-0 px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group}
            </h3>
            <div className="grid gap-px">
              {items.map((item) => (
                <button
                  className="command-result group flex items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  key={`${item.group}:${item.id}`}
                  type="button"
                  onClick={() => navigate(item.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">{item.label}</span>
                    <small className="block truncate font-mono text-[11px] text-muted-foreground">
                      {item.description}
                    </small>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </button>
              ))}
            </div>
          </section>
        ))}
        {results.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <CornerDownLeft aria-hidden="true" className="size-3" /> to open
      </p>
    </OverlayDialog>
  );
}
