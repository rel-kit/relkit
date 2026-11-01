import { describe, expect, test } from "bun:test";

const app = (path: string): Promise<string> => Bun.file(`${import.meta.dir}/../app/${path}`).text();

describe("inspector redesign contracts", () => {
  test("uses the shared accessible shell and resource pattern", async () => {
    const [shell, layout, table, filters, packageJson] = await Promise.all([
      app("inspector-shell.tsx"),
      app("layout.tsx"),
      app("resource-table.tsx"),
      app("signals-filters.tsx"),
      Bun.file(`${import.meta.dir}/../package.json`).text(),
    ]);
    expect(shell).toContain("CommandPalette");
    // Dark-first: rendered dark on the server, a stored "light" preference applied before paint.
    expect(layout).toContain('data-theme="dark"');
    expect(layout).toContain("INSPECTOR_THEME_KEY");
    expect(layout).toContain("suppressHydrationWarning");
    expect(shell).toContain("applyInspectorTheme");
    expect(shell).toContain("SidebarProvider");
    expect(shell).toContain("AppSidebar");
    expect(table).toContain("ResourceTableBody");
    expect(table).toContain("Pagination");
    expect(table).toContain("OverlayDialog");
    expect(table).toContain("PageHeader");
    expect(filters).toContain("Filters are applied by the versioned backend");
    expect(packageJson).toContain('"react-aria-components"');
    expect(packageJson).toContain('"tailwindcss"');
  });

  test("provides React Flow and an interactive redacted trace waterfall", async () => {
    const [
      flow,
      relationships,
      trace,
      rows,
      details,
      traceStyles,
      traceList,
      logTrace,
      traceSummary,
      signalPage,
      styles,
      model,
    ] = await Promise.all([
      app("graph/graph-flow.tsx"),
      app("graph/graph-relationships.tsx"),
      app("trace-waterfall.tsx"),
      app("trace-waterfall-rows.tsx"),
      app("trace-waterfall-detail.tsx"),
      app("traces/traces.css"),
      app("traces/traces-client.tsx"),
      app("logs/log-trace.tsx"),
      app("logs/log-trace-summary.tsx"),
      Bun.file(`${import.meta.dir}/use-signal-page.ts`).text(),
      app("globals.css"),
      Bun.file(`${import.meta.dir}/observability-trace-model.ts`).text(),
    ]);
    for (const feature of ["ReactFlow", "MiniMap", "Controls", "fitView"])
      expect(flow).toContain(feature);
    expect(relationships).toContain("Relationship table");
    expect(trace).toContain("Errors only");
    expect(trace).toContain("Collapse all");
    expect(trace).toContain("Numbered by recorded time");
    expect(trace).not.toContain("Timeline zoom");
    // Trace view: whole-request summary, lifecycle strip, and details always visible beside the
    // waterfall instead of behind a drawer of tabs.
    expect(trace).toContain('aria-label="Lifecycle"');
    expect(trace).toContain("TraceStepDetails");
    expect(trace).not.toContain("OverlayDialog");
    expect(details).toContain('aria-label="Step details"');
    for (const section of ["Input", "Output", "Error", "Events", "Attributes", "Identity"])
      expect(details).toContain(`title="${section}"`);
    // Tree waterfall on the trace clock: nesting, collapsible parents, bars and event points.
    expect(rows).toContain('aria-label="Ordered trace timeline"');
    expect(rows).toContain("data-record-type={row.type}");
    expect(rows).toContain("row.depth * 14");
    expect(rows).toContain("onToggle(span.id)");
    expect(rows).toContain('className="waterfall-bar"');
    expect(rows).toContain('className="waterfall-point"');
    expect(traceList).toContain('placement="right"');
    expect(traceList).toContain("100 traces per page");
    expect(signalPage).toContain('kind === "traces" ? 100 : 50');
    expect(logTrace).toContain('item.phase === "completed"');
    expect(logTrace).toContain('client.query("logs", { traceId, limit: 100 })');
    expect(logTrace).toContain("attachLogs");
    expect(traceSummary).toContain('{ label: "Ended at"');
    expect(traceSummary).toContain("/routes/${encodeURIComponent(routeId)}");
    expect(traceSummary).toContain("/functions/${encodeURIComponent(functionId)}");
    expect(traceSummary).toContain('outcome === "success"');
    expect(styles).toContain('.overlay-dialog-panel[data-placement="right"][data-entering]');
    expect(traceStyles).toContain("container-type: inline-size");
    expect(traceStyles).toContain(".trace-lifecycle");
    expect(model).toContain('return "[redacted]"');
  });

  test("renders provider topology and distinguishes capture from durable history", async () => {
    const [provider, runtime, cohort, signals] = await Promise.all([
      app("provider-detail.tsx"),
      app("runtime-status.tsx"),
      app("activation-cohort.tsx"),
      app("signals-client.tsx"),
    ]);
    expect(provider).toContain("BINDING TOPOLOGY");
    expect(provider).toContain("Package");
    expect(provider).toContain("LOCAL LIFECYCLE");
    expect(provider).not.toContain("node.configuration");
    expect(runtime).toContain("APPLICATION EXPORT STATUS");
    expect(runtime).toContain("LiveHistoryStatus");
    expect(runtime).toContain("Accepted by app capture");
    expect(runtime).toContain("External exporters");
    expect(cohort).toContain('role="alert"');
    expect(signals).toContain("Capture and history are bounded");
  });
});
