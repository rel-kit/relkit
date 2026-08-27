import { canonicalJson } from "@relkit/contracts";
import { fail, secretName } from "./from-graph-validation.js";

export function validateBoundary(value: unknown): void {
  try {
    canonicalJson(value);
  } catch (error) {
    fail(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      error instanceof Error ? error.message : "Boundary is not JSON-safe.",
    );
  }
  scan(value);
}

function scan(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(pulumi|client|live(client|object)?|resource)$/i.test(key))
      fail(
        "RELKIT_DEPLOY_LIVE_OBJECT_UNSUPPORTED",
        "Live deployment objects cannot cross the graph boundary.",
      );
    if (secretName(key) && (child === null || typeof child !== "object") && child !== true)
      fail("RELKIT_DEPLOY_SECRET_UNSUPPORTED", "Secret values cannot cross the graph boundary.");
    scan(child);
  }
}
