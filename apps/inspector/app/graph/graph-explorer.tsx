"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { GraphSnapshot } from "../../lib/graph-model";
import { buildHierarchy } from "../../lib/graph-hierarchy";
import {
  canFollow,
  domainLocation,
  followLocation,
  graphHref,
  type GraphLocation,
  isDomainId,
  locationFor,
  parentLocation,
  parseGraphLocation,
  resolveView,
  clearFilters,
  toggleFilter,
} from "../../lib/graph-url-state";
import { GraphFilters } from "./graph-filters";
import { GraphCanvas } from "./graph-canvas";
import { ExplorerBar } from "./graph-explorer-bar";
import { useViewLayout } from "./graph-explorer-layout";
import { GraphInspector } from "./graph-inspector";
import { allGroupKeys, buildOutline, GraphOutline, outlinePathTo } from "./graph-outline";
import { GraphRelationships } from "./graph-relationships";

export function GraphExplorer({ graph }: { readonly graph: GraphSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const location = useMemo(() => parseGraphLocation(params), [params]);
  const hierarchy = useMemo(() => buildHierarchy(graph), [graph]);
  const view = useMemo(() => resolveView(hierarchy, location), [hierarchy, location]);
  const selectedId =
    location.node !== undefined && hierarchy.nodes.has(location.node) ? location.node : undefined;

  const direction = location.dir ?? "down";
  const navigate = useCallback(
    (next: GraphLocation) => {
      // Direction and filters are viewer preferences: they survive every navigation.
      const kept: GraphLocation = {
        ...next,
        ...(next.dir === undefined && location.dir !== undefined ? { dir: location.dir } : {}),
        ...(next.only === undefined && location.only !== undefined ? { only: location.only } : {}),
      };
      router.replace(`${pathname}${graphHref(kept).slice("/graph".length)}`, { scroll: false });
    },
    [location.dir, location.only, pathname, router],
  );

  const viewKey = `${view.mode}:${view.focusId ?? ""}:${location.platform ? "p" : ""}:${direction}:${(location.only ?? []).join(",")}:${graph.graphHash}`;
  const { layout, layoutKey, layoutError } = useViewLayout(view, direction, viewKey);

  const select = useCallback(
    (id: string | undefined) => {
      if (id === undefined) {
        const { node: _node, ...rest } = location;
        navigate(rest);
        return;
      }
      // One rule everywhere: selecting a card keeps the current view and shows its details.
      // Opening (double-click, "Open domain", "Follow request") is the only way to change view.
      const domainBox = id.startsWith("group:") ? id.slice("group:".length) : undefined;
      if (domainBox !== undefined) {
        navigate({ ...location, node: domainBox });
        return;
      }
      if (view.nodes.some((node) => node.id === id) && hierarchy.nodes.has(id)) {
        navigate({ ...location, node: id });
        return;
      }
      // Not on this canvas (a link in the details panel): go where the card lives.
      navigate(locationFor(hierarchy, id, location, view));
    },
    [hierarchy, location, navigate, view],
  );
  const open = useCallback(
    (raw: string) => {
      const id = raw.startsWith("group:") ? raw.slice("group:".length) : raw;
      const routeGroupOwner =
        hierarchy.nodes.get(id)?.kind === "route-group" ? hierarchy.ownerOf.get(id) : undefined;
      if (routeGroupOwner !== undefined && isDomainId(hierarchy, routeGroupOwner))
        navigate(domainLocation(routeGroupOwner, location));
      else if (isDomainId(hierarchy, id)) navigate(domainLocation(id, location));
      else if (canFollow(hierarchy, id)) navigate(followLocation(id, location));
      else navigate(locationFor(hierarchy, id, location, view));
    },
    [hierarchy, location, navigate, view],
  );
  const up = useCallback(
    () => navigate(parentLocation(hierarchy, location, view)),
    [hierarchy, location, navigate, view],
  );

  const [query, setQuery] = useState("");
  const outline = useMemo(() => buildOutline(hierarchy, query), [hierarchy, query]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(["domains", "platform"]),
  );
  useEffect(() => {
    if (query.trim() !== "") {
      setExpanded(new Set(allGroupKeys(outline)));
      return;
    }
    if (selectedId === undefined) return;
    const path = outlinePathTo(outline, selectedId);
    if (path.length === 0) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const key of path) next.add(key);
      return next;
    });
  }, [outline, query, selectedId]);

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && !typing && view.mode !== "architecture") {
        event.preventDefault();
        up();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [up, view.mode]);

  const [outlineOpen, setOutlineOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  useEffect(() => {
    // A request flow is wide; give it the room by default. The toggle still works.
    setOutlineOpen(view.mode !== "flow");
  }, [view.mode]);

  const relationshipEdges = useMemo(() => view.edges.flatMap((edge) => edge.edges), [view.edges]);

  return (
    <section
      className="explorer graph-panel"
      data-outline={outlineOpen ? "open" : "closed"}
      data-inspector={inspectorOpen ? "open" : "closed"}
      aria-labelledby="explorer-heading"
    >
      <ExplorerBar
        hierarchy={hierarchy}
        location={location}
        view={view}
        direction={direction}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((value) => !value)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((value) => !value)}
        onUp={up}
        navigate={navigate}
      />
      <aside className="explorer__outline" aria-label="Outline">
        <GraphOutline
          entries={outline}
          selectedId={selectedId}
          expandedKeys={expanded}
          onExpandedChange={setExpanded}
          onSelect={(id) => {
            if (view.mode === "architecture" || !view.nodes.some((node) => node.id === id))
              open(id);
            else select(id);
          }}
        />
      </aside>
      <div className="explorer__canvas">
        <GraphCanvas
          view={view}
          layout={layout}
          layoutKey={layoutKey}
          refitKey={`${outlineOpen ? "o" : ""}${inspectorOpen ? "i" : ""}`}
          toolbar={
            <GraphFilters
              selected={new Set(location.only ?? [])}
              available={view.available}
              platform={location.platform === true}
              onToggle={(id) => navigate(toggleFilter(location, id))}
              onClear={() => navigate(clearFilters(location))}
              onPlatform={() =>
                navigate(
                  location.platform === true
                    ? (({ platform: _platform, ...rest }) => rest)(location)
                    : { ...location, platform: true },
                )
              }
            />
          }
          selectedId={selectedId}
          onSelect={select}
          onOpen={open}
          {...(layoutError !== ""
            ? { status: layoutError }
            : layout === undefined
              ? { status: "Laying out…" }
              : {})}
        />
      </div>
      <aside className="explorer__inspector" aria-label="Details">
        <GraphInspector
          hierarchy={hierarchy}
          graph={graph}
          view={view}
          nodeId={selectedId}
          canFollow={(id) => canFollow(hierarchy, id)}
          onSelect={select}
          onFollow={(id) => navigate(followLocation(id, location))}
          onOpenDomain={(id) => navigate(domainLocation(id, location))}
        />
      </aside>
      <details className="explorer__relationships">
        <summary>
          <h2 className="explorer__relationships-title">Relationship table</h2>
        </summary>
        <GraphRelationships edges={relationshipEdges} />
      </details>
    </section>
  );
}
