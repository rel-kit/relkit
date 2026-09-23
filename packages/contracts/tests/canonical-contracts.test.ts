import { describe, expect, test } from "vitest";
import {
  API_BASE_PATH,
  API_VERSION,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  PROTOCOL_VERSION,
  assertJsonValue,
  canonicalJson,
  isJsonValue,
  normalizeId,
  normalizeSourcePath,
  serializeJson,
} from "../src/index.js";
import { JOBS_WIRE_VERSION } from "../src/jobs-wire.js";

describe("canonical contracts", () => {
  test("serializes equivalent values identically and rejects invalid JSON", () => {
    expect(canonicalJson({ b: 2, a: ["second", "first"] })).toBe('{"a":["second","first"],"b":2}');
    expect(canonicalJson).toBe(serializeJson);
    expect(isJsonValue({ nested: Object.create(null) })).toBe(true);
    expect(() => assertJsonValue({ invalid: undefined })).toThrow("Invalid JSON value");
  });

  test("normalizes IDs and source paths", () => {
    expect(normalizeId(" orders.created ")).toBe("orders.created");
    expect(() => normalizeId("orders/created")).toThrow("Invalid stable ID");
    expect(normalizeSourcePath("src\\routes\\orders.ts")).toBe("src/routes/orders.ts");
    expect(() => normalizeSourcePath("../outside.ts")).toThrow(
      "Invalid source location: file cannot escape its root",
    );
  });

  test("keeps protocol and artifact versions independent", () => {
    expect({
      contract: CONTRACT_VERSION,
      generator: GENERATOR_VERSION,
      graph: GRAPH_VERSION,
      manifest: MANIFEST_VERSION,
      api: API_VERSION,
      protocol: PROTOCOL_VERSION,
    }).toEqual({ contract: 7, generator: 7, graph: 10, manifest: 10, api: 1, protocol: 1 });
    expect(API_BASE_PATH).toBe("/_relkit/v1");
    expect(JOBS_WIRE_VERSION).toBe(1);
  });
});
