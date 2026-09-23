import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  createSourceLocation,
  createSourceLocationEffect,
  normalizeSourceLocation,
  normalizeSourceLocationEffect,
  normalizeSourcePath,
  normalizeSourcePathEffect,
  SourceLocationError,
} from "../src/index.js";
import {
  isWithin,
  isWithinEffect,
  joinSegments,
  joinSegmentsEffect,
  parsePath,
  parsePathEffect,
} from "../src/source-path.js";

describe("portable source paths", () => {
  test("normalizes separators, dot segments, and absolute paths below a root", () => {
    expect(normalizeSourcePath("src\\routes\\orders.ts")).toBe("src/routes/orders.ts");
    expect(Effect.runSync(normalizeSourcePathEffect("src/../index.ts"))).toBe("index.ts");
    expect(normalizeSourcePath("/app/src/index.ts", "/app")).toBe("src/index.ts");
    expect(normalizeSourcePath("C:\\WORK\\app\\src\\index.ts", "c:/work/app")).toBe("src/index.ts");
    expect(normalizeSourcePath("src/index.ts", "/app")).toBe("src/index.ts");
  });

  test("rejects invalid roots, escaped paths, and files outside the root", () => {
    const invalid: Array<[string, string | undefined, string]> = [
      ["", undefined, "file must be a non-empty path"],
      ["../outside.ts", undefined, "file cannot escape its root"],
      ["/app/src/index.ts", undefined, "an absolute file requires an absolute project root"],
      ["src/index.ts", "relative-root", "project root must be absolute"],
      ["/other/index.ts", "/app", "file must be inside the project root"],
      ["/app", "/app", "file must be inside the project root"],
    ];
    for (const [file, root, message] of invalid) {
      expect(() => normalizeSourcePath(file, root)).toThrow(message);
      expect(Effect.runSync(Effect.flip(normalizeSourcePathEffect(file, root)))).toBeInstanceOf(
        SourceLocationError,
      );
    }
    expect(() => normalizeSourcePath(null as unknown as string)).toThrow("file must be a string");
    expect(() => normalizeSourcePath("src/index.ts", 1 as unknown as string)).toThrow(
      "project root must be a string",
    );
  });

  test("parses platform roots and enforces strict containment", () => {
    const file = parsePath("C:\\Work\\app\\src\\index.ts", "file");
    const root = Effect.runSync(parsePathEffect("c:/work/app", "project root"));
    expect(file.rootKey).toBe("c:");
    expect(isWithin(file, root)).toBe(true);
    expect(Effect.runSync(isWithinEffect(file, root))).toBe(true);
    expect(isWithin(root, root)).toBe(false);
    expect(isWithin(parsePath("D:/work/app/src/index.ts", "file"), root)).toBe(false);
    expect(parsePath("//server/share/file.ts", "file").rootKey).toBe("unc");
    expect(parsePath("/../app/index.ts", "file").segments).toEqual(["app", "index.ts"]);
    expect(() => parsePath("bad:segment", "file")).toThrow("file contains an invalid ':' segment");
    expect(() => parsePath("a\0b", "file")).toThrow("file must be a non-empty path");
  });

  test("joins nonempty segments through both APIs", () => {
    expect(joinSegments(["src", "index.ts"])).toBe("src/index.ts");
    expect(Effect.runSync(joinSegmentsEffect(["src", "index.ts"]))).toBe("src/index.ts");
    expect(() => joinSegments([])).toThrow("file must be below the project root");
    expect(Effect.runSync(Effect.flip(joinSegmentsEffect([])))).toBeInstanceOf(SourceLocationError);
  });

  test("does not misclassify unexpected parser defects as path errors", () => {
    expect(() => Effect.runSync(Effect.flip(parsePathEffect({} as string, "file")))).toThrow();
    expect(() =>
      Effect.runSync(Effect.flip(joinSegmentsEffect(null as unknown as string[]))),
    ).toThrow();
  });

  test("validates one-based coordinates and normalizes existing locations", () => {
    const location = { file: "src\\index.ts", line: 2, column: 3 };
    expect(normalizeSourceLocation(location)).toEqual({ file: "src/index.ts", line: 2, column: 3 });
    expect(Effect.runSync(normalizeSourceLocationEffect(location))).toEqual(
      normalizeSourceLocation(location),
    );
    expect(createSourceLocation("/app/src/index.ts", 1, 1, "/app")).toEqual({
      file: "src/index.ts",
      line: 1,
      column: 1,
    });
    for (const coordinate of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => createSourceLocation("src/index.ts", coordinate, 1)).toThrow(
        "line must be a positive integer",
      );
      expect(() => createSourceLocation("src/index.ts", 1, coordinate)).toThrow(
        "column must be a positive integer",
      );
      expect(
        Effect.runSync(Effect.flip(createSourceLocationEffect("src/index.ts", coordinate, 1))),
      ).toBeInstanceOf(SourceLocationError);
    }
  });
});
