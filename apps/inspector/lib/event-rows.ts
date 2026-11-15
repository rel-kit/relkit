import type { InspectorEventRuntime, InspectorObject } from "./api-types";
import { EVENT_DELIVERY_STATES } from "./events-model";

/** What the API reported about the deliveries of an event beyond the page that is loaded. */
export interface DeliveryPage {
  /** Total deliveries, when the provider reports it. */
  readonly total?: number | undefined;
  /** Deliveries per state, when the provider reports them. */
  readonly counts?: Readonly<Record<string, number>> | undefined;
  /** Another page can be loaded. */
  readonly hasMore: boolean;
}

/**
 * A count that says whether it is the whole. A provider that reports a total gives the number; a
 * full page with more behind it is only a lower bound, so it reads "100+".
 * @param loaded - How many records are loaded.
 * @param page - Whether more can be loaded, and the total when the provider reports one.
 * @returns The text to show.
 */
export function countLabel(
  loaded: number,
  page: { readonly total?: number | undefined; readonly hasMore: boolean },
): string {
  if (page.total !== undefined) return String(page.total);
  return page.hasMore ? `${loaded}+` : String(loaded);
}

type DeliveryState = (typeof EVENT_DELIVERY_STATES)[number];

/**
 * Deliveries per state. The provider's own counts are the whole; counts taken from the loaded page
 * are the whole only when nothing is left to load.
 * @param deliveries - Loaded deliveries.
 * @param source - The provider's per-state counts when reported, and whether more can be loaded.
 * @returns The counts and whether they cover every delivery.
 */
export function stateCounts(
  deliveries: readonly InspectorObject[],
  source: {
    readonly reported?: Readonly<Record<string, number>> | undefined;
    readonly hasMore: boolean;
  },
): { readonly counts: Readonly<Record<DeliveryState, number>>; readonly exact: boolean } {
  const counts = Object.fromEntries(
    EVENT_DELIVERY_STATES.map((state) => [state, source.reported?.[state] ?? 0]),
  ) as Record<DeliveryState, number>;
  if (source.reported === undefined)
    for (const item of deliveries) {
      const state = typeof item.state === "string" ? item.state : "";
      if (state in counts) counts[state as DeliveryState] += 1;
    }
  return { counts, exact: source.reported !== undefined || !source.hasMore };
}

/**
 * Adds the next page of an event's runtime records to the pages already loaded.
 * @param previous - What is loaded.
 * @param next - The page that followed it.
 * @returns One runtime with each record once, and the continuation of the last page.
 */
export function mergeEventRuntime(
  previous: InspectorEventRuntime,
  next: InspectorEventRuntime,
): InspectorEventRuntime {
  const deliveries = unique([...previous.deliveries, ...next.deliveries], "deliveryId");
  const { nextCursor: _previousCursor, ...rest } = previous;
  return {
    ...rest,
    ...(next.total === undefined ? {} : { total: next.total }),
    ...(next.counts === undefined ? {} : { counts: next.counts }),
    publications: unique([...previous.publications, ...next.publications], "instanceId"),
    items: deliveries,
    deliveries,
    deadLetters: unique([...previous.deadLetters, ...next.deadLetters], "deliveryId"),
    ...(next.nextCursor === undefined ? {} : { nextCursor: next.nextCursor }),
  };
}

function unique(items: readonly InspectorObject[], key: string): InspectorObject[] {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const id = item[key];
    if (id === undefined || !seen.has(id)) {
      seen.add(id);
      return true;
    }
    return false;
  });
}

const PREVIEW_LENGTH = 80;

/** A short preview of a record's payload, when the API returns one; a long one is cut with "…". */
export function payloadPreview(item: InspectorObject): string | undefined {
  const value =
    typeof item.payloadPreview === "string"
      ? item.payloadPreview
      : item.payload === undefined
        ? undefined
        : safeStringify(item.payload);
  if (value === undefined || value === "") return undefined;
  return value.length > PREVIEW_LENGTH ? `${value.slice(0, PREVIEW_LENGTH)}…` : value;
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function firstText(item: InspectorObject, keys: readonly string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value !== "") return value;
    // The events API stamps records with epoch milliseconds.
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      return new Date(value).toISOString();
  }
  return "";
}

/** When a publication was accepted. */
export function publicationTime(item: InspectorObject): string {
  return firstText(item, ["publishedAt", "occurredAt", "timestamp"]);
}

/** When a delivery last changed. */
export function deliveryTime(item: InspectorObject): string {
  return firstText(item, ["updatedAt", "timestamp", "availableAt", "createdAt"]);
}

function idOf(item: InspectorObject, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

/** The trace a publication was made in, when the API reports one. */
export function publicationTraceId(item: InspectorObject): string | undefined {
  return idOf(item, ["traceId", "producerTraceId"]);
}

/** The request a publication was made in, when the API reports one. */
export function publicationRequestId(item: InspectorObject): string | undefined {
  return idOf(item, ["originRequestId"]);
}

/** The trace of the publication a delivery belongs to, when the publication recorded one. */
export function deliveryTraceId(
  delivery: InspectorObject,
  publications: readonly InspectorObject[],
): string | undefined {
  const instance = delivery.eventInstanceId;
  if (typeof instance !== "string") return undefined;
  const publication = publications.find((item) => item.instanceId === instance);
  return publication === undefined ? undefined : publicationTraceId(publication);
}
