import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import {
  createDiagnosticReporter,
  createDiagnosticReporterEffect,
  diagnosticsToJson,
  formatCiAnnotations,
  formatCiAnnotationsEffect,
  formatDiagnostic,
  formatDiagnosticEffect,
  formatDiagnostics,
  formatDiagnosticsEffect,
  serializeDiagnostics,
  serializeDiagnosticsEffect,
  toCiAnnotations,
  toCiAnnotationsEffect,
  DiagnosticSource,
  DiagnosticSourceLive,
  resolveSource,
} from "../src/index.js";
import type { DiagnosticInput } from "../src/index.js";

const input: DiagnosticInput = {
  code: "X",
  severity: "error",
  message: "Bad",
  file: "src/a.ts",
  line: 2,
  column: 3,
  related: [{ file: "src/b.ts", line: 1, column: 1, message: "See this" }],
  suggestion: "Fix it",
  documentationPath: "docs/a.md",
};

describe("diagnostic presentation", () => {
  it("renders excerpts through a deterministic source Layer", () => {
    const source = Layer.succeed(DiagnosticSource, {
      read: (file) => (file === "src/a.ts" ? "first\r\nsecond\rthird" : "related"),
    });
    const text = Effect.runSync(
      Effect.provide(formatDiagnosticEffect(input, { color: true }), source),
    );
    expect(text).toContain("src/a.ts:2:3 - \u001b[31merror\u001b[0m X: Bad");
    expect(text).toContain("second");
    expect(text).toContain("related: src/b.ts:1:1 - See this");
    expect(text).toContain("suggestion: Fix it");
    expect(text).toContain("docs: docs/a.md");
    expect(formatDiagnostic(input, { source: () => "first\nsecond" })).toContain("second");
  });

  it("lets the live source Layer override a compatibility callback", () => {
    const options = Effect.runSync(
      Effect.provide(resolveSource({ source: () => "from callback" }), DiagnosticSourceLive),
    );
    expect(options.source?.("src/a.ts")).toBeUndefined();
  });

  it("keeps source reads ordered and exposes provider failures by tag", () => {
    const seen: string[] = [];
    const providerError = new Error("source unavailable");
    const source = Layer.succeed(DiagnosticSource, {
      read: (file) => {
        seen.push(file);
        if (file === "src/b.ts") throw providerError;
        return "source";
      },
    });
    const tagged = Effect.runSync(
      Effect.provide(
        Effect.catchTag(
          formatDiagnosticsEffect([input, { ...input, file: "src/c.ts", related: undefined }]),
          "DiagnosticSourceError",
          (error) => Effect.succeed(error),
        ),
        source,
      ),
    );
    expect(tagged).toMatchObject({
      _tag: "DiagnosticSourceError",
      file: "src/b.ts",
      cause: providerError,
    });
    expect(seen).toEqual(["src/a.ts", "src/b.ts"]);
    expect(() =>
      formatDiagnostic(input, {
        source: (file) => {
          if (file === "src/b.ts") throw providerError;
          return "source";
        },
      }),
    ).toThrow(providerError);
  });

  it("renders missing, distant, and short source safely", () => {
    expect(formatDiagnostic({ code: "I", severity: "info", message: "Note" })).toBe("info I: Note");
    expect(formatDiagnostic(input, { source: () => undefined })).not.toContain(" | ");
    expect(
      formatDiagnostic({ ...input, related: undefined }, { source: () => "only one" }),
    ).not.toContain(" | ");
    const short: DiagnosticInput = { ...input, line: 1, column: 100, related: undefined };
    expect(formatDiagnostic(short, { source: () => "hi", color: true })).toContain("\u001b[31m");
    expect(formatDiagnostic({ ...short, severity: "warning" }, { color: true })).toContain(
      "\u001b[33m",
    );
    expect(formatDiagnostic({ ...short, severity: "info" }, { color: true })).toContain(
      "\u001b[36m",
    );
    expect(
      formatDiagnostic({ ...short, related: [{ file: "b.ts", line: 1, column: 1 }] }),
    ).toContain("related: b.ts:1:1");
  });

  it("keeps batch Effect output and compatibility adapters aligned", () => {
    const inputs = [input, { code: "I", severity: "info", message: "Note" }] as const;
    expect(formatDiagnostics(inputs)).toBe(Effect.runSync(formatDiagnosticsEffect(inputs)));
    expect(serializeDiagnostics(inputs)).toBe(Effect.runSync(serializeDiagnosticsEffect(inputs)));
    expect(diagnosticsToJson(inputs)).toBe(serializeDiagnostics(inputs));
    expect(toCiAnnotations(inputs)).toEqual(Effect.runSync(toCiAnnotationsEffect(inputs)));
    expect(formatCiAnnotations(inputs)).toBe(Effect.runSync(formatCiAnnotationsEffect(inputs)));
    expect(Effect.runSync(formatDiagnosticsEffect([]))).toBe("");
  });

  it("escapes CI commands and keeps annotations portable", () => {
    const dangerous: DiagnosticInput = {
      ...input,
      code: "A:%",
      message: "a,b\r\nc",
      file: "src/a,b.ts",
    };
    const annotation = toCiAnnotations([dangerous])[0];
    expect(annotation).toMatchObject({ level: "error", title: "A:%", file: "src/a,b.ts" });
    expect(annotation).not.toHaveProperty("suggestion");
    expect(formatCiAnnotations([dangerous])).toContain("title=A%3A%25::a%2Cb%0D%0Ac");
    expect(toCiAnnotations([{ code: "I", severity: "info", message: "Note" }])[0]).toMatchObject({
      level: "notice",
    });
  });

  it("creates a frozen reporter with all three adapters", () => {
    const reporter = createDiagnosticReporter();
    expect(Object.keys(reporter)).toEqual(
      Object.keys(Effect.runSync(createDiagnosticReporterEffect())),
    );
    expect(Object.isFrozen(reporter)).toBe(true);
    expect(reporter.text([input])).toBe(formatDiagnostics([input]));
    expect(reporter.json([input])).toBe(serializeDiagnostics([input]));
    expect(reporter.ci([input])).toBe(formatCiAnnotations([input]));
  });

  it("reports typed invalid input in every Effect presentation operation", () => {
    const invalid = { ...input, code: "" };
    const effects = [
      formatDiagnosticEffect(invalid),
      formatDiagnosticsEffect([invalid]),
      serializeDiagnosticsEffect([invalid]),
      toCiAnnotationsEffect([invalid]),
      formatCiAnnotationsEffect([invalid]),
    ];
    for (const effect of effects) {
      const error = Effect.runSync(
        Effect.catchTag(effect, "DiagnosticValidationError", (failure) => Effect.succeed(failure)),
      );
      expect(error).toMatchObject({
        _tag: "DiagnosticValidationError",
        message: "Diagnostic code must be a non-empty string",
      });
    }
    const reporter = createDiagnosticReporter();
    for (const run of [
      () => formatDiagnostic(invalid),
      () => formatDiagnostics([invalid]),
      () => serializeDiagnostics([invalid]),
      () => toCiAnnotations([invalid]),
      () => formatCiAnnotations([invalid]),
      () => reporter.text([invalid]),
      () => reporter.json([invalid]),
      () => reporter.ci([invalid]),
    ]) {
      expect(run).toThrow(new TypeError("Diagnostic code must be a non-empty string"));
    }
  });
});
