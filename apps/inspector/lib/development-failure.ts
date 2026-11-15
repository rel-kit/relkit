import type { InspectorApiClient } from "./api";
import type { InspectorObject } from "./api-types";
import type { StreamEventType } from "./stream-protocol";

export interface DevelopmentFailure {
  readonly cursor: string;
  readonly message: string;
  readonly details: readonly string[];
  readonly detailsUnavailable: boolean;
  readonly suggestion: string;
  readonly logsHref: string;
}

/**
 * When a live event should re-read the reload status: soon when the generation changes, later
 * (coalesced) when logs or diagnostics arrive, since the supervisor reports a failed
 * reload only as a `dev.generation.failed` log and the stream does not say which log arrived.
 */
export function failureRefresh(type: StreamEventType): "now" | "later" | undefined {
  if (type === "generation.changed") return "now";
  if (type === "log.emitted" || type === "diagnostic.changed") return "later";
  return undefined;
}

/** Reads supervisor failures from the retained development logs, including failed startup output. */
export async function loadDevelopmentFailure(
  client: Pick<InspectorApiClient, "query">,
  previous?: DevelopmentFailure,
): Promise<DevelopmentFailure | undefined> {
  const page = await client.query("logs", {
    source: "relkit",
    search: "dev.generation.",
    order: "desc",
    limit: 20,
  });
  const latest = page.items.find(
    (item) =>
      item.origin === "relkit" &&
      item.component === "cli.dev" &&
      // A restart activates a generation; a successful in-process reload swaps it.
      (item.message === "dev.generation.failed" ||
        item.message === "dev.generation.active" ||
        item.message === "dev.generation.swapped"),
  );
  if (latest?.message !== "dev.generation.failed") return undefined;
  if (previous !== undefined && latest.cursor === previous.cursor && !previous.detailsUnavailable)
    return previous;
  const fields = record(latest.fields);
  const message = text(fields?.message) ?? "The latest application version could not start.";
  const to = timestamp(latest.timestamp);
  // The redacted cause (a compile error or the failed process's last lines) comes first.
  const cause = (text(fields?.cause) ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, 3);
  const startup = to === undefined ? [] : await startupFailures(client, to).catch(() => undefined);
  const details = startup === undefined ? undefined : [...new Set([...cause, ...startup])];
  const logs = new URLSearchParams({ source: "all", range: "custom", severity: "error" });
  if (to !== undefined) logs.set("to", to);
  return {
    cursor: text(latest.cursor) ?? to ?? message,
    message,
    details: details ?? cause,
    detailsUnavailable: details === undefined,
    suggestion: /docker/i.test(message)
      ? "Start Docker Desktop or your Docker daemon and check that docker ps succeeds. Then save a source file to retry the reload."
      : "Resolve the reported errors, then save .env or a source file to retry the reload.",
    logsHref: `/logs?${logs}`,
  };
}

async function startupFailures(
  client: Pick<InspectorApiClient, "query">,
  to: string,
): Promise<readonly string[]> {
  const builds = await client.query("logs", {
    source: "relkit",
    search: "dev.build.started",
    order: "desc",
    limit: 1,
    to,
  });
  const build = builds.items[0];
  const from = timestamp(build?.timestamp);
  if (build?.message !== "dev.build.started" || from === undefined) return [];
  const errors = await client.query("logs", {
    source: "application",
    search: "startup failed",
    severity: "error",
    order: "desc",
    limit: 20,
    from,
    to,
  });
  return [...new Set(errors.items.flatMap(startupMessage))];
}

function startupMessage(item: InspectorObject): readonly string[] {
  const message = text(item.message);
  if (item.origin !== "application" || !message || !/startup failed/i.test(message)) return [];
  const fields = record(item.fields);
  const detail = text(fields?.detail) ?? text(record(fields?.error)?.message);
  return [detail === undefined ? message : `${message}: ${detail}`];
}

function record(value: unknown): InspectorObject | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function timestamp(value: unknown): string | undefined {
  const result = text(value);
  return result !== undefined && Number.isFinite(Date.parse(result)) ? result : undefined;
}
