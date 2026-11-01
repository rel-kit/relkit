import { describe, expect, test } from "bun:test";
import type { EnvironmentFieldView } from "./env-diagnostics-model";
import {
  environmentFlags,
  groupEnvironment,
  keyPrefix,
  requirementLabel,
} from "./overview-environment";

function field(name: string, overrides: Partial<EnvironmentFieldView> = {}): EnvironmentFieldView {
  return {
    name,
    type: "string",
    requiredIn: [],
    hasDefault: false,
    optional: false,
    sensitive: false,
    ...overrides,
  };
}

const fields = [
  field("LOG_LEVEL", {
    hasDefault: true,
    source: { file: "relkit.config.ts", line: 6, column: 16 },
  }),
  field("BETTER_AUTH_URL", { hasDefault: true }),
  field("BETTER_AUTH_SECRET", { sensitive: true }),
  field("DATABASE_PATH", { source: { file: "db.config.ts", line: 1, column: 1 } }),
  field("DATABASE_URL", { sensitive: true, optional: true }),
];

describe("keyPrefix", () => {
  test("uses the longest prefix shared with another key", () => {
    const names = fields.map((item) => item.name);
    expect(keyPrefix("BETTER_AUTH_URL", names)).toBe("BETTER_AUTH_");
    expect(keyPrefix("DATABASE_URL", names)).toBe("DATABASE_");
    expect(keyPrefix("LOG_LEVEL", names)).toBeUndefined();
  });
});

describe("groupEnvironment", () => {
  test("groups by prefix with ungrouped keys last", () => {
    expect(
      groupEnvironment(fields, "prefix").map((group) => [
        group.label,
        group.fields.map((item) => item.name),
      ]),
    ).toEqual([
      ["BETTER_AUTH_*", ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]],
      ["DATABASE_*", ["DATABASE_PATH", "DATABASE_URL"]],
      ["Ungrouped", ["LOG_LEVEL"]],
    ]);
  });

  test("groups by source file and by sensitivity", () => {
    expect(groupEnvironment(fields, "source").map((group) => group.label)).toEqual([
      "db.config.ts",
      "relkit.config.ts",
      "Source unavailable",
    ]);
    expect(
      groupEnvironment(fields, "sensitivity").map((group) => [group.label, group.fields.length]),
    ).toEqual([
      ["Plain values", 3],
      ["Secrets", 2],
    ]);
  });
});

describe("environment labels", () => {
  test("describes requirement and flags", () => {
    expect(requirementLabel(field("A", { requiredIn: ["production"] }))).toBe(
      "Required in production",
    );
    expect(requirementLabel(field("A", { optional: true }))).toBe("Optional");
    expect(requirementLabel(field("A"))).toBe("Required by default");
    expect(environmentFlags(field("A", { sensitive: true })).map((flag) => flag.label)).toEqual([
      "secret",
      "required",
    ]);
    expect(environmentFlags(field("A", { hasDefault: true })).map((flag) => flag.label)).toEqual([
      "default",
    ]);
  });
});
