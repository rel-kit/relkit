import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  formatCiAnnotations,
  formatDiagnostics,
  serializeDiagnostics,
  toCiAnnotations,
} from "../../packages/diagnostics/src/index.ts";
import type {
  DiagnosticInput,
  DiagnosticReporterOptions,
} from "../../packages/diagnostics/src/index.ts";

const repositoryRoot = resolve(import.meta.dir, "../..");
const alternateRoot = "/tmp/relkit-diagnostics-root-2.12";
const syntheticSecret = "synthetic-diagnostic-secret-2.12";

const sourceByFile: Record<string, string> = {
  "src/functions/orders.ts": [
    "export const handler = defineFunction();",
    'const input = { id: "order-1" };',
    "return handler(input);",
    "const duplicate = handler;",
  ].join("\n"),
  "src/routes.ts": [
    "export const orders = defineRoute();",
    "const route = orders;",
    "route.get();",
    "const duplicate = orders;",
    'throw new Error("duplicate");',
  ].join("\n"),
  "src/routes/index.ts": 'export { orders } from "../routes";',
};

function readGolden(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dir, "golden", name), "utf8"));
}

function diagnostics(root: string): readonly DiagnosticInput[] {
  return [
    {
      code: "RELKIT_CONVENTION_DIRECTORY",
      severity: "warning",
      message: "Route is outside the recommended directory",
      file: join(root, "src/routes.ts"),
      line: 2,
      column: 7,
      descriptorId: "orders.route",
      related: [
        {
          file: join(root, "src/routes/index.ts"),
          line: 1,
          column: 1,
          message: "Exported route is here",
        },
        {
          file: join(root, "src/functions/orders.ts"),
          line: 4,
          column: 3,
          message: "Target function is declared here",
          descriptorId: "orders.handler",
        },
      ],
      suggestion: "Move the descriptor under src/routes/**/*.route.ts",
      documentationPath: join(root, "docs/diagnostics.md"),
    },
    {
      code: "RELKIT_DUPLICATE_ID",
      severity: "error",
      message: "Descriptor ID is already declared",
      file: join(root, "src/routes.ts"),
      line: 5,
      column: 8,
      descriptorId: "orders.route",
      related: [
        {
          file: join(root, "src/routes.ts"),
          line: 2,
          column: 7,
          message: "First route declaration",
          descriptorId: "orders.route",
        },
        {
          file: join(root, "src/functions/orders.ts"),
          line: 4,
          column: 3,
          message: "Duplicate target uses this ID",
          descriptorId: "orders.handler",
        },
      ],
      suggestion: "Choose a unique stable descriptor ID",
      documentationPath: "docs/diagnostics.md",
    },
  ];
}

function options(root: string, color = false): DiagnosticReporterOptions {
  return {
    projectRoot: root,
    color,
    source: (file) => sourceByFile[file],
  };
}

function assertPortable(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(repositoryRoot);
  expect(serialized).not.toContain(alternateRoot);
  expect(serialized).not.toContain(syntheticSecret);
}

describe.serial("@relkit/diagnostics", () => {
  test("keeps text and JSON output stable across absolute roots", () => {
    const rootOptions = options(repositoryRoot);
    const alternateOptions = options(alternateRoot);
    const expected = {
      diagnostics: JSON.parse(serializeDiagnostics(diagnostics(repositoryRoot), rootOptions)),
      text: formatDiagnostics(diagnostics(repositoryRoot), rootOptions),
      color: formatDiagnostics(diagnostics(repositoryRoot), options(repositoryRoot, true)),
      ci: formatCiAnnotations(diagnostics(repositoryRoot), rootOptions),
    };
    const alternate = {
      diagnostics: JSON.parse(serializeDiagnostics(diagnostics(alternateRoot), alternateOptions)),
      text: formatDiagnostics(diagnostics(alternateRoot), alternateOptions),
      color: formatDiagnostics(diagnostics(alternateRoot), options(alternateRoot, true)),
      ci: formatCiAnnotations(diagnostics(alternateRoot), alternateOptions),
    };

    expect(alternate).toEqual(expected);
    expect(expected.diagnostics).toEqual(readGolden("diagnostics.json"));
    expect({ text: expected.text, color: expected.color, ci: expected.ci }).toEqual(
      readGolden("text.json"),
    );
    assertPortable(expected);
    assertPortable(readGolden("diagnostics.json"));
    assertPortable(readGolden("text.json"));
  });

  test("keeps CI annotations limited to safe location fields", () => {
    const diagnostic = diagnostics(repositoryRoot)[0];
    const annotation = toCiAnnotations(
      [
        {
          ...diagnostic,
          suggestion: syntheticSecret,
        },
      ],
      options(repositoryRoot),
    )[0];

    expect(annotation).toEqual({
      level: "warning",
      title: "RELKIT_CONVENTION_DIRECTORY",
      message: "Route is outside the recommended directory",
      code: "RELKIT_CONVENTION_DIRECTORY",
      file: "src/routes.ts",
      line: 2,
      column: 7,
    });
    expect(annotation).not.toHaveProperty("suggestion");
    expect(JSON.stringify(annotation)).not.toContain(syntheticSecret);
  });
});
