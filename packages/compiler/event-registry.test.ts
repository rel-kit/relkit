import { expect, test } from "bun:test";
import type { ExtractedDescriptor } from "./src/discovery/extract.ts";
import { generateEventRegistry } from "./src/event-registry.ts";

test("generates a deterministic event registry with project-relative imports", () => {
  const descriptors = [
    event("orders.updated", "src/events/updated.event.ts", "updated"),
    event("orders.created", "src/events/created.event.ts", "created"),
  ];
  const first = generateEventRegistry(descriptors, { projectRoot: "/workspace/app" });
  const second = generateEventRegistry([...descriptors].reverse(), {
    projectRoot: "/workspace/app",
  });

  expect(second).toBe(first);
  expect(first).toContain(
    'readonly "orders.created": typeof import("../../src/events/created.event.js")["created"]',
  );
  expect(first.indexOf("orders.created")).toBeLessThan(first.indexOf("orders.updated"));
});

function event(id: string, module: string, exportName: string): ExtractedDescriptor {
  return {
    descriptor: { kind: "event", id },
    reference: { kind: "event", descriptorId: id, module, exportName },
    source: { file: module, line: 1, column: 1 },
    exportName,
    exportKind: "named",
  } as ExtractedDescriptor;
}
