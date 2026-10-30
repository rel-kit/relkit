"use client";

/** Lays out the current view asynchronously and tracks the result, its remount key and errors. */
import { useEffect, useState } from "react";
import { layoutView, type LayoutDirection, type ViewLayout } from "../../lib/graph-view-layout";
import type { GraphView } from "../../lib/graph-views";

export function useViewLayout(view: GraphView, direction: LayoutDirection, viewKey: string) {
  const [layout, setLayout] = useState<ViewLayout>();
  const [layoutKey, setLayoutKey] = useState(0);
  const [layoutError, setLayoutError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLayoutError("");
    setLayout(undefined);
    void layoutView(view, direction).then(
      (next) => {
        if (cancelled) return;
        setLayout(next);
        setLayoutKey((value) => value + 1);
      },
      (error) =>
        !cancelled && setLayoutError(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      cancelled = true;
    };
    // The view object is derived from viewKey's inputs; relayout only when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  return { layout, layoutKey, layoutError };
}
