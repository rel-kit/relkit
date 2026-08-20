export const navigationGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", glyph: "O" },
      { href: "/graph", label: "Graph", glyph: "G" },
      { href: "/routes", label: "Routes", glyph: "R" },
      { href: "/api-reference", label: "API Reference", glyph: "A" },
      { href: "/functions", label: "Functions", glyph: "F" },
    ],
  },
  {
    label: "Runtime",
    items: [
      { href: "/jobs", label: "Jobs", glyph: "J" },
      { href: "/events", label: "Events & listeners", glyph: "E" },
      { href: "/buckets", label: "Buckets", glyph: "B" },
      { href: "/cache", label: "Cache", glyph: "C" },
      { href: "/tools", label: "Tools", glyph: "T" },
      { href: "/agents", label: "Agents", glyph: "A" },
    ],
  },
  {
    label: "Signals",
    items: [
      { href: "/requests", label: "Requests", glyph: "R" },
      { href: "/logs", label: "Logs", glyph: "L" },
      { href: "/traces", label: "Traces", glyph: "T" },
      { href: "/env", label: "Environment", glyph: "E" },
      { href: "/diagnostics", label: "Diagnostics", glyph: "D" },
    ],
  },
] as const;

export const navigation = navigationGroups.flatMap(({ label: group, items }) =>
  items.map((item) => ({ ...item, group })),
);
