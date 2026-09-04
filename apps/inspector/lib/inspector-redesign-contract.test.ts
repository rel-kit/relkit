import { describe, expect, test } from "bun:test";

const app = (path: string): Promise<string> => Bun.file(`${import.meta.dir}/../app/${path}`).text();

describe("inspector redesign contracts", () => {
  test("uses the shared accessible shell and resource pattern", async () => {
    const [shell, table, filters, packageJson] = await Promise.all([
      app("inspector-shell.tsx"),
      app("resource-table.tsx"),
      app("signals-filters.tsx"),
      Bun.file(`${import.meta.dir}/../package.json`).text(),
    ]);
    expect(shell).toContain("CommandPalette");
    expect(shell).toContain("prefers-color-scheme: dark");
    expect(shell).toContain("SidebarProvider");
    expect(shell).toContain("AppSidebar");
    expect(table).toContain("ResourceTableBody");
    expect(table).toContain("Pagination");
    expect(table).toContain("OverlayDialog");
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
    expect(rows).toContain('data-branch={event ? "true" : "false"}');
    expect(rows).not.toContain("trace-step-summary");
    expect(rows).not.toContain("waterfall-track");
    expect(rows).toContain("valuePreview(stepInput(step))");
    expect(rows).toContain("valuePreview(stepOutput(step))");
    expect(rows).toContain('className="trace-step-meta"');
    expect(rows).not.toContain("timeline-event-icon");
    expect(rows).not.toContain("span.depth * 1.1");
    expect(rows).not.toContain("onToggle");
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
    expect(styles).toContain('.timeline-sequence[data-branch="true"]::before');
    expect(styles).toContain(".trace-panel .waterfall-row:last-child::before");
    expect(styles).toContain('.overlay-dialog-panel[data-placement="right"][data-entering]');
    expect(model).toContain('return "[redacted]"');
  });

  test("renders provider topology and complete local observability status", async () => {
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
    expect(runtime).toContain("COMPLETE LOCAL EVIDENCE");
    expect(runtime).toContain("External exporters");
    expect(cohort).toContain('role="alert"');
    expect(signals).toContain("external sampling happens afterward");
  });
});
