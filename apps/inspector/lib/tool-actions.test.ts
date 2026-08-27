import { describe, expect, test } from "bun:test";
import { createInspectorApiClient } from "./api";
import { invokeToolApproval, supportsToolApproval, toolActionCapabilities } from "./tool-actions";

const envelope = (value: Record<string, unknown>) =>
  new Response(JSON.stringify({ protocol: "relkit.inspector", version: 1, ...value }), {
    headers: { "content-type": "application/json", "x-relkit-api-version": "1" },
  });

describe("inspector tool approval actions", () => {
  test("uses advertised capabilities and sends active identity and call ids", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const client = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async (requestUrl, requestInit) => {
        url = String(requestUrl);
        init = requestInit;
        return envelope(
          String(requestUrl).endsWith("/_relkit/v1")
            ? { capabilities: ["/_relkit/v1/actions/tools/:id/approve"] }
            : { approval: { state: "approved" } },
        );
      },
    });

    const capabilities = await toolActionCapabilities(client);
    expect(supportsToolApproval(capabilities, "approve")).toBe(true);
    expect(supportsToolApproval(capabilities, "deny")).toBe(false);
    await invokeToolApproval(client, "approve", {
      toolId: "orders.tool",
      invocationId: "invocation-1",
      toolCallId: "call-1",
      generationId: "generation-one",
      graphHash: "sha256:one",
      idempotencyKey: "approval-1",
    });
    expect(url).toBe("/_relkit/v1/actions/tools/orders.tool/approve");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      generationId: "generation-one",
      graphHash: "sha256:one",
      invocationId: "invocation-1",
      toolCallId: "call-1",
    });
  });
});
