/** Defensive readers for the untyped values inside a node's projected metadata. */
import type { GraphNode } from "./graph-model";

export const meta = (node: GraphNode): Readonly<Record<string, unknown>> => node.meta ?? {};
export const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;
export const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const strings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
export const records = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.flatMap((item): Record<string, unknown>[] => {
        const found = record(item);
        return found === undefined ? [] : [found];
      })
    : [];
