import { describe, expect, test } from "bun:test";
import { recognizeIdentifier } from "./graph-index";

describe("identifiers pasted into the command palette", () => {
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

  test("recognises a request id", () => {
    expect(recognizeIdentifier("request-0198a6c2-7d3e-7a10-9c0f-5b2d6e8a1f34")).toEqual({
      kind: "request",
      id: "request-0198a6c2-7d3e-7a10-9c0f-5b2d6e8a1f34",
      href: "/requests/request-0198a6c2-7d3e-7a10-9c0f-5b2d6e8a1f34",
      label: "Open request request-0198a6c2-7d3e-7a10-9c0f-5b2d6e8a1f34",
    });
  });

  test("recognises a trace id and opens it in lower case", () => {
    expect(recognizeIdentifier(traceId)).toEqual({
      kind: "trace",
      id: traceId,
      href: `/traces/${traceId}`,
      label: `Open trace ${traceId}`,
    });
    expect(recognizeIdentifier(traceId.toUpperCase())?.id).toBe(traceId);
  });

  test("ignores the spaces around a pasted value", () => {
    expect(recognizeIdentifier(`  ${traceId}\n`)?.kind).toBe("trace");
  });

  test("leaves everything else to the search", () => {
    expect(recognizeIdentifier("")).toBeUndefined();
    expect(recognizeIdentifier("orders")).toBeUndefined();
    expect(recognizeIdentifier("request")).toBeUndefined();
    expect(recognizeIdentifier("request-")).toBeUndefined();
    expect(recognizeIdentifier("4bf92f3577b34da6a3ce929d0e0e47")).toBeUndefined();
    expect(recognizeIdentifier(`${traceId}0`)).toBeUndefined();
    expect(recognizeIdentifier("request-abc def")).toBeUndefined();
    expect(recognizeIdentifier("zzf92f3577b34da6a3ce929d0e0e4736")).toBeUndefined();
  });
});
