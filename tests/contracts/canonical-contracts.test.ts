import { describe, expect, test } from "bun:test";
import {
  API_BASE_PATH,
  API_VERSION,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  PROTOCOL_VERSION,
  SourceLocationError,
  StableIdError,
  assertJsonValue,
  assertStableId,
  canonicalJson,
  createSourceLocation,
  isJsonValue,
  isProtocolId,
  isStableId,
  normalizeId,
  normalizeProtocolId,
  normalizeSourceLocation,
  normalizeSourcePath,
  serializeJson,
  toEventInstanceId,
  toGenerationId,
  toGraphHash,
  toInvocationId,
  toRequestId,
  toTraceId,
} from "../../packages/contracts/src/index.ts";

describe.serial("canonical contracts", () => {
  test("sorts object keys recursively while preserving array order", () => {
    const first = {
      z: { b: 2, a: 1 },
      a: [{ d: "مرحبا", c: "😀" }, -0, Number.MIN_VALUE, Number.MAX_VALUE],
    };
    const second = {
      a: [{ c: "😀", d: "مرحبا" }, 0, Number.MIN_VALUE, Number.MAX_VALUE],
      z: { a: 1, b: 2 },
    };

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(canonicalJson(first)).toBe(
      '{"a":[{"c":"😀","d":"مرحبا"},0,5e-324,1.7976931348623157e+308],"z":{"a":1,"b":2}}',
    );
    expect(canonicalJson(["second", "first"])).toBe('["second","first"]');
    expect(canonicalJson({ text: "café / مرحبا / 🚀" })).toBe('{"text":"café / مرحبا / 🚀"}');
    expect(canonicalJson).toBe(serializeJson);
    expect(isJsonValue({ nested: Object.create(null) })).toBe(true);
    assertJsonValue(first);
  });

  test("rejects invalid JSON values with stable paths", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;

    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", { enumerable: true, get: () => 1 });

    const accessorObject: Record<string, unknown> = {};
    Object.defineProperty(accessorObject, "bad", { enumerable: true, get: () => 1 });

    const symbolKeys: Record<string, unknown> = {};
    Object.defineProperty(symbolKeys, Symbol("bad"), { enumerable: true, value: 1 });

    const extraArray = [1] as unknown[];
    Object.defineProperty(extraArray, "extra", { enumerable: true, value: 2 });

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    class CustomValue {
      readonly value = 1;
    }

    const invalid: Array<[string, unknown, string]> = [
      ["undefined", undefined, "undefined is not JSON data"],
      ["function", () => 1, "functions are not JSON data"],
      ["symbol", Symbol("value"), "symbols are not JSON data"],
      ["bigint", 1n, "bigints are not JSON data"],
      ["NaN", Number.NaN, "non-finite numbers are not JSON data"],
      ["Infinity", Number.POSITIVE_INFINITY, "non-finite numbers are not JSON data"],
      ["negative Infinity", Number.NEGATIVE_INFINITY, "non-finite numbers are not JSON data"],
      ["date", new Date(0), "only arrays and plain objects are JSON data"],
      ["map", new Map(), "only arrays and plain objects are JSON data"],
      ["set", new Set(), "only arrays and plain objects are JSON data"],
      ["class instance", new CustomValue(), "only arrays and plain objects are JSON data"],
      ["sparse array", sparse, "sparse arrays are not JSON data"],
      ["array accessor", accessorArray, "accessor properties are not JSON data"],
      ["object accessor", accessorObject, "accessor properties are not JSON data"],
      ["symbol key", symbolKeys, "symbol keys are not JSON data"],
      ["array property", extraArray, "array properties are not JSON data"],
      ["cycle", cycle, "cycles are not JSON data"],
    ];

    for (const [name, value, reason] of invalid) {
      expect(isJsonValue(value), name).toBe(false);
      expect(() => serializeJson(value), name).toThrow(reason);
      expect(() => assertJsonValue(value), name).toThrow("Invalid JSON value");
    }

    expect(() => serializeJson({ bad: undefined })).toThrow(
      'Invalid JSON value at $["bad"]: undefined is not JSON data',
    );
    expect(() => serializeJson({ nested: { bad: Number.NaN } })).toThrow(
      'Invalid JSON value at $["nested"]["bad"]: non-finite numbers are not JSON data',
    );
  });

  test("normalizes explicit IDs and protocol IDs without source paths", () => {
    const id = normalizeId(" orders.created ");
    expect(id).toBe("orders.created");
    expect(isStableId(id)).toBe(true);
    expect(isStableId(" orders.created ")).toBe(false);

    for (const invalid of [
      "",
      " ",
      "orders created",
      "orders/created",
      "orders:created",
      ".orders",
      "orders.",
      "orders..created",
      "-orders",
      "orders-",
      42,
      null,
      undefined,
    ]) {
      expect(() => normalizeId(invalid)).toThrow("Invalid stable ID");
    }

    expect(() => normalizeId("orders:created")).toThrow(
      "Invalid stable ID: use letters, numbers, '.', '_' or '-' between alphanumeric segments",
    );
    expect(() => normalizeId(null)).toThrow("Invalid stable ID: expected a string");
    expect(() => assertStableId(" orders.created ")).toThrow(
      "Invalid stable ID: expected a canonical stable ID",
    );
    expect(() => normalizeProtocolId(undefined)).toThrow(StableIdError);

    const protocolIds = [
      normalizeProtocolId("protocol.v1"),
      toGraphHash("graph.v1"),
      toGenerationId("generation.v1"),
      toRequestId("request.v1"),
      toTraceId("10000000000000000000000000000001"),
      toInvocationId("invocation.v1"),
      toEventInstanceId("event.v1"),
    ];
    for (const protocolId of protocolIds) expect(isProtocolId(protocolId)).toBe(true);
  });

  test("normalizes source locations across roots and separators", () => {
    const relative = "src\\routes\\orders.ts";
    expect(normalizeSourcePath(relative)).toBe("src/routes/orders.ts");
    expect(normalizeSourcePath("src/../index.ts")).toBe("index.ts");

    const roots = ["/tmp/relkit-project-one", "C:\\workspace\\relkit-project-two"];
    for (const root of roots) {
      const separator = root.includes("\\") ? "\\" : "/";
      expect(normalizeSourcePath(`${root}${separator}src${separator}index.ts`, root)).toBe(
        "src/index.ts",
      );
    }

    expect(normalizeSourcePath("D:\\WORK\\relkit\\src\\index.ts", "d:/work/relkit")).toBe(
      "src/index.ts",
    );
    expect(normalizeSourcePath("src/index.ts", "/tmp/relkit-project-one")).toBe("src/index.ts");
    expect(() => normalizeSourcePath("/tmp/other/src/index.ts", "/tmp/relkit-project-one")).toThrow(
      "Invalid source location: file must be inside the project root",
    );
    expect(() => normalizeSourcePath("/tmp/relkit-project-one/src/index.ts")).toThrow(
      "Invalid source location: an absolute file requires an absolute project root",
    );
    expect(() => normalizeSourcePath("../outside.ts")).toThrow(
      "Invalid source location: file cannot escape its root",
    );
  });

  test("validates one-based source positions with stable errors", () => {
    expect(createSourceLocation("src\\index.ts", 1, 1)).toEqual({
      file: "src/index.ts",
      line: 1,
      column: 1,
    });
    expect(
      createSourceLocation("/tmp/relkit-project-one/src/index.ts", 2, 3, "/tmp/relkit-project-one"),
    ).toEqual({ file: "src/index.ts", line: 2, column: 3 });
    expect(
      normalizeSourceLocation(
        { file: "src\\index.ts", line: 4, column: 5 },
        "/tmp/relkit-project-one",
      ),
    ).toEqual({ file: "src/index.ts", line: 4, column: 5 });

    for (const line of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createSourceLocation("src/index.ts", line, 1)).toThrow(
        "Invalid source location: line must be a positive integer",
      );
    }
    for (const column of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createSourceLocation("src/index.ts", 1, column)).toThrow(
        "Invalid source location: column must be a positive integer",
      );
    }
    expect(() => createSourceLocation("src/index.ts", 1, 0)).toThrow(SourceLocationError);
  });

  test("versions graph and manifest shapes independently from v1 protocols", () => {
    expect({
      contract: CONTRACT_VERSION,
      generator: GENERATOR_VERSION,
      graph: GRAPH_VERSION,
      manifest: MANIFEST_VERSION,
      api: API_VERSION,
      protocol: PROTOCOL_VERSION,
    }).toEqual({ contract: 5, generator: 5, graph: 8, manifest: 8, api: 1, protocol: 1 });
    expect(PROTOCOL_VERSION).toBe(API_VERSION);
    expect(API_BASE_PATH).toBe("/_relkit/v1");
  });
});
