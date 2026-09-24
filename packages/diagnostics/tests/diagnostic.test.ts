import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  createDiagnostic,
  createDiagnosticEffect,
  normalizeDiagnostic,
  sortDiagnostics,
  sortDiagnosticsEffect,
} from "../src/index.js";
import type { DiagnosticInput } from "../src/index.js";

const base: DiagnosticInput = { code: " X ", severity: "warning", message: " Note " };

describe("diagnostic normalization", () => {
  it("keeps the compatibility adapter and Effect result identical and immutable", () => {
    const input: DiagnosticInput = {
      ...base,
      descriptor: "orders.route",
      docs: "docs\\errors.md",
      suggestion: "Fix it",
      related: [
        { file: "z.ts", line: 2, column: 1, message: "second" },
        { file: "a.ts", line: 1, column: 2, descriptorId: "orders.route" },
      ],
    };
    const effect = Effect.runSync(createDiagnosticEffect(input));
    expect(createDiagnostic(input)).toEqual(effect);
    expect(normalizeDiagnostic(input)).toEqual(effect);
    expect(effect).toMatchObject({
      code: "X",
      message: "Note",
      descriptorId: "orders.route",
      documentationPath: "docs/errors.md",
      related: [{ file: "a.ts" }, { file: "z.ts" }],
    });
    expect(Object.isFrozen(effect)).toBe(true);
    expect(Object.isFrozen(effect.related)).toBe(true);
    expect(Object.isFrozen(effect.related?.[0])).toBe(true);
  });

  it("normalizes flat and nested locations to portable paths", () => {
    const options = { projectRoot: "/tmp/relkit" };
    const flat = createDiagnostic(
      { ...base, file: "/tmp/relkit/src/a.ts", line: 2, column: 3 },
      options,
    );
    const nested = createDiagnostic(
      {
        ...base,
        location: { file: "/tmp/relkit/src/a.ts", line: 2, column: 3 },
        documentationPath: "/tmp/relkit/docs/a.md",
      },
      options,
    );
    expect(flat.file).toBe("src/a.ts");
    expect(nested).toMatchObject({ file: "src/a.ts", documentationPath: "docs/a.md" });
    expect(
      createDiagnostic({ ...base, documentationPath: "https://example.test/a" }).documentationPath,
    ).toBe("https://example.test/a");
  });

  it("sorts related locations with equal coordinates by message", () => {
    const diagnostic = createDiagnostic({
      ...base,
      related: [
        { file: "a.ts", line: 1, column: 1, message: "last" },
        { file: "a.ts", line: 1, column: 1 },
        { file: "a.ts", line: 1, column: 1, message: "first" },
      ],
    });
    expect(diagnostic.related?.map((item) => item.message)).toEqual([undefined, "first", "last"]);
  });

  it("orders diagnostics without locations by content", () => {
    const sorted = sortDiagnostics([
      { ...base, code: "B" },
      { ...base, code: "A" },
    ]);
    expect(sorted.map((item) => item.code)).toEqual(["A", "B"]);
  });

  it.each([
    [{ ...base, code: "" }, "Diagnostic code must be a non-empty string", "code"],
    [{ ...base, message: " " }, "Diagnostic message must be a non-empty string", "message"],
    [
      { ...base, severity: "fatal" },
      "Diagnostic severity must be info, warning, or error",
      "severity",
    ],
    [{ ...base, line: 1 }, "Diagnostic locations require file, line, and column", "location"],
    [
      {
        ...base,
        location: { file: "a.ts", line: 1, column: 1 },
        file: "a.ts",
        line: 1,
        column: 1,
      },
      "Diagnostic location must use location or file/line/column, not both",
      "location",
    ],
    [
      { ...base, documentationPath: "" },
      "Diagnostic documentationPath must be a non-empty string",
      "documentationPath",
    ],
  ])("uses a tagged Effect failure and preserves the adapter message", (input, message, field) => {
    const tagged = Effect.runSync(
      Effect.catchTag(
        createDiagnosticEffect(input as DiagnosticInput),
        "DiagnosticValidationError",
        (error) => Effect.succeed(error),
      ),
    );
    expect(tagged).toMatchObject({ _tag: "DiagnosticValidationError", message, field });
    expect(() => createDiagnostic(input as DiagnosticInput)).toThrow(new TypeError(message));
  });

  it("keeps upstream validation errors in the typed input channel", () => {
    const error = Effect.runSync(
      Effect.catchTag(
        createDiagnosticEffect({ ...base, descriptorId: "" }),
        "DiagnosticValidationError",
        (failure) => Effect.succeed(failure),
      ),
    );
    expect(error).toMatchObject({ _tag: "DiagnosticValidationError", field: "input" });
  });

  it("sorts by file, location, code, severity, and message", () => {
    const inputs: DiagnosticInput[] = [
      { ...base, file: "b.ts", line: 1, column: 1 },
      { ...base, file: "a.ts", line: 2, column: 1 },
      { ...base, file: "a.ts", line: 1, column: 2 },
      { ...base, code: "B", file: "a.ts", line: 1, column: 1 },
      { ...base, code: "A", severity: "error", file: "a.ts", line: 1, column: 1 },
      { ...base, code: "A", severity: "info", file: "a.ts", line: 1, column: 1 },
      { ...base, code: "A", severity: "info", message: "After", file: "a.ts", line: 1, column: 1 },
      base,
    ];
    const sorted = Effect.runSync(sortDiagnosticsEffect(inputs));
    expect(sortDiagnostics(inputs)).toEqual(sorted);
    expect(
      sorted.map((value) => [
        value.file,
        value.line,
        value.column,
        value.code,
        value.severity,
        value.message,
      ]),
    ).toEqual([
      ["a.ts", 1, 1, "A", "error", "Note"],
      ["a.ts", 1, 1, "A", "info", "After"],
      ["a.ts", 1, 1, "A", "info", "Note"],
      ["a.ts", 1, 1, "B", "warning", "Note"],
      ["a.ts", 1, 2, "X", "warning", "Note"],
      ["a.ts", 2, 1, "X", "warning", "Note"],
      ["b.ts", 1, 1, "X", "warning", "Note"],
      [undefined, undefined, undefined, "X", "warning", "Note"],
    ]);
    expect(Effect.runSync(sortDiagnosticsEffect([]))).toEqual([]);
  });

  it("propagates the first invalid sorted input through the typed channel", () => {
    const invalid = [
      { ...base, code: "" },
      { ...base, severity: "fatal" },
    ] as DiagnosticInput[];
    const failure = Effect.runSync(
      Effect.catchTag(sortDiagnosticsEffect(invalid), "DiagnosticValidationError", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(failure).toMatchObject({
      _tag: "DiagnosticValidationError",
      message: "Diagnostic code must be a non-empty string",
    });
    expect(() => sortDiagnostics(invalid)).toThrow("Diagnostic code must be a non-empty string");
  });

  it("leaves unexpected exceptions as defects", () => {
    const unexpected = new Error("unexpected getter");
    const input = { ...base };
    Object.defineProperty(input, "code", {
      get: () => {
        throw unexpected;
      },
    });
    const exit = Effect.runSyncExit(createDiagnosticEffect(input));
    expect(exit._tag).toBe("Failure");
    expect(() => createDiagnostic(input)).toThrow(unexpected);
  });
});
