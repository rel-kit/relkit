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
    const [flow, relationships, trace, model] = await Promise.all([
      app("graph/graph-flow.tsx"),
      app("graph/graph-relationships.tsx"),
      app("trace-waterfall.tsx"),
      Bun.file(`${import.meta.dir}/observability-trace-model.ts`).text(),
    ]);
    for (const feature of ["ReactFlow", "MiniMap", "Controls", "fitView"])
      expect(flow).toContain(feature);
    expect(relationships).toContain("Relationship table");
    expect(trace).toContain("Errors only");
    expect(trace).toContain("Collapse all");
    expect(trace).toContain("Attributes & logs");
    expect(model).toContain('return "[redacted]"');
  });
});
