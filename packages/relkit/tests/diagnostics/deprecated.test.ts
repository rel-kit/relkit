import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deprecated, resetDeprecationWarnings } from "../../src/diagnostics/index.js";
import { DIAGNOSTIC_CODES, diagnosticDocsUrl } from "../../src/diagnostics/codes/index.js";

function capture() {
  const lines: string[] = [];
  const write = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const spies = (["log", "warn", "error", "info"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(write),
  );
  return { lines, restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

describe("deprecated", () => {
  let output: ReturnType<typeof capture>;
  beforeEach(() => {
    resetDeprecationWarnings();
    output = capture();
  });
  afterEach(() => output.restore());

  it("warns once per process with the replacement and the docs link", () => {
    deprecated("RELKIT_DEPRECATED_APP_PACKAGE", 'imports from "relkit"');
    deprecated("RELKIT_DEPRECATED_APP_PACKAGE", 'imports from "relkit"');
    const warnings = output.lines.filter((line) => line.includes("RELKIT_DEPRECATED_APP_PACKAGE"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Use imports from "relkit" instead.');
    expect(warnings[0]).toContain(diagnosticDocsUrl("RELKIT_DEPRECATED_APP_PACKAGE"));
  });

  it("keeps a separate once-only warning for each code", () => {
    deprecated("RELKIT_DEPRECATED_APP_PACKAGE", "relkit");
    deprecated("RELKIT_DEPRECATED_BETTER_AUTH_OPTIONS", "defineBetterAuthService({ auth })");
    expect(output.lines.join("\n")).toContain("RELKIT_DEPRECATED_BETTER_AUTH_OPTIONS");
    expect(output.lines.filter((line) => line.includes("RELKIT_DEPRECATED_"))).toHaveLength(2);
  });

  it("warns again after the warnings are reset", () => {
    deprecated("RELKIT_DEPRECATED_APP_PACKAGE", "relkit");
    resetDeprecationWarnings();
    deprecated("RELKIT_DEPRECATED_APP_PACKAGE", "relkit");
    expect(output.lines.filter((line) => line.includes("RELKIT_DEPRECATED_"))).toHaveLength(2);
  });

  it("falls back to the code when it has no catalog entry", () => {
    deprecated("RELKIT_DEPRECATED_UNLISTED" as never, "something else");
    expect(output.lines.join("\n")).toContain(
      "RELKIT_DEPRECATED_UNLISTED: RELKIT_DEPRECATED_UNLISTED.",
    );
  });

  it("documents every deprecation code", () => {
    const codes = DIAGNOSTIC_CODES.filter(({ code }) => code.startsWith("RELKIT_DEPRECATED_"));
    expect(codes.map(({ code }) => code)).toEqual([
      "RELKIT_DEPRECATED_APP_PACKAGE",
      "RELKIT_DEPRECATED_BETTER_AUTH_OPTIONS",
    ]);
    for (const { fix } of codes) expect(fix.length).toBeGreaterThan(0);
  });
});
