import type { JsonValue } from "@relkit/contracts";
import { listJobRuns } from "./runs.js";
import type { ResolvedActiveGeneration } from "../shared.js";

export async function runtimeJobSummary(generation: ResolvedActiveGeneration): Promise<JsonValue> {
  try {
    const result = await listJobRuns(
      generation,
      new Request("http://inspector/_relkit/v1/jobs/runs?limit=25"),
    );
    if (isRecord(result)) {
      const items = Array.isArray(result.items) ? result.items : [];
      return {
        ...(result.count === undefined ? {} : { count: result.count }),
        items,
        ...(result.availability === undefined ? {} : { availability: result.availability }),
        ...(result.hasMore === undefined ? {} : { hasMore: result.hasMore }),
      } as JsonValue;
    }
  } catch {
    return {
      items: [],
      availability: [{ state: "unavailable", reason: "jobs service unavailable" }],
    };
  }
  return {
    items: [],
    availability: [{ state: "unavailable", reason: "jobs service unavailable" }],
  };
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
