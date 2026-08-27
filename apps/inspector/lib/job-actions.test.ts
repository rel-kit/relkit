import { describe, expect, test } from "bun:test";
import { createInspectorApiClient } from "./api";
import { invokeJobAction, jobActionCapabilities, supportsJobAction } from "./job-actions";

const envelope = (value: Record<string, unknown>) =>
  new Response(JSON.stringify({ protocol: "relkit.inspector", version: 1, ...value }), {
    headers: { "content-type": "application/json", "x-relkit-api-version": "1" },
  });

describe("inspector job actions", () => {
  test("follows advertised capabilities and sends active identity to the action boundary", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const client = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async (requestUrl, requestInit) => {
        url = String(requestUrl);
        init = requestInit;
        return envelope(
          String(requestUrl).endsWith("/_relkit/v1")
            ? { capabilities: ["/_relkit/v1/actions/jobs/:id/retry"] }
            : { action: { outcome: "applied" } },
        );
      },
    });

    const capabilities = await jobActionCapabilities(client);
    expect(supportsJobAction(capabilities, "retry")).toBe(true);
    expect(supportsJobAction(capabilities, "cancel")).toBe(false);
    await invokeJobAction(client, "retry", {
      instanceId: "job-1",
      generationId: "generation-one",
      graphHash: "sha256:one",
      idempotencyKey: "retry-1",
    });
    expect(url).toBe("/_relkit/v1/actions/jobs/job-1/retry");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      generationId: "generation-one",
      graphHash: "sha256:one",
      instanceId: "job-1",
    });
  });
});
