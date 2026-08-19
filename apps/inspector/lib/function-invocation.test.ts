import { describe, expect, test } from "bun:test";
import { createInspectorApiClient } from "./api";
import { invokeFunction } from "./function-invocation";

describe("function invocation client", () => {
  test("uses the versioned local action boundary with active identity", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const client = createInspectorApiClient({
      fetch: async (requestUrl, requestInit) => {
        url = String(requestUrl);
        init = requestInit;
        return new Response(
          JSON.stringify({
            protocol: "zsys.inspector",
            version: 1,
            output: { ok: true },
          }),
          { headers: { "content-type": "application/json", "x-zsys-api-version": "1" } },
        );
      },
    });

    const result = await invokeFunction(client, {
      functionId: "orders.get",
      generationId: "generation-one",
      graphHash: "sha256:one",
      input: { orderId: "order-1" },
      idempotencyKey: "manual-1",
    });

    expect(url).toBe("/_zsys/v1/actions/functions/orders.get/invoke");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("manual-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      generationId: "generation-one",
      graphHash: "sha256:one",
      functionId: "orders.get",
      input: { orderId: "order-1" },
    });
    expect(result.output).toEqual({ ok: true });
  });
});
