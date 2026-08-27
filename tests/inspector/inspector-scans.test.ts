import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  FORBIDDEN_PAYLOAD_MARKERS,
  payloadViolations,
  scanInspectorImports,
} from "./inspector-scans.ts";

const root = resolve(import.meta.dir, "../..");

describe("inspector protocol boundary scans", () => {
  test("keeps imports and network access behind the local protocol clients", async () => {
    const result = await scanInspectorImports(root);
    expect(result.files).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
    expect(result.networkFiles).toEqual([
      "apps/inspector/app/%5Frelkit/backend/[...path]/route.ts",
      "apps/inspector/lib/api-transport.ts",
      "apps/inspector/lib/stream.ts",
    ]);
  });

  test("detects forbidden handler, provider, and secret payloads", () => {
    const safe = '{"protocol":"relkit.inspector","graphHash":"sha256:fixture"}';
    expect(payloadViolations("safe", safe)).toEqual([]);
    for (const marker of FORBIDDEN_PAYLOAD_MARKERS)
      expect(payloadViolations("unsafe", marker)).toContain(`unsafe: ${marker}`);
    expect(payloadViolations("unsafe", '{"handler":{}}')).toContain("unsafe: handler object");
    expect(payloadViolations("unsafe", "ProviderClient")).toContain(
      "unsafe: provider client or secret",
    );
  });
});
