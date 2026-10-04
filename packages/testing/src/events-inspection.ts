import { normalizeId } from "@relkit/contracts";
import type { TestEventControlState } from "./events-runtime-controls.types.js";

/**
 * Counts eligible durable deliveries and persisted publications still awaiting fanout.
 * @param state Authoritative native router and publication ledgers.
 * @param triggerId Optional declared trigger identity restricting the count.
 * @returns The native pending count, preserving closed-owner errors.
 */
export function pendingEventDeliveries(state: TestEventControlState, triggerId?: string): number {
  if (state.work.closed) throw new Error("Test event is closed");
  const id = triggerId === undefined ? undefined : normalizeId(triggerId);
  const durable = state
    .router()
    .snapshot()
    .deliveries.filter(
      (delivery) =>
        ["available", "leased", "delayed"].includes(delivery.state) &&
        (id === undefined || delivery.triggerId === id),
    ).length;
  const unfanned = [...state.unfanned.values()].filter((envelope) =>
    state.triggers.some(
      (trigger) =>
        (id === undefined || trigger.id === id) &&
        trigger.eventId === envelope.eventId &&
        trigger.eventVersion === envelope.version,
    ),
  ).length;
  return durable + unfanned;
}

/**
 * Counts acknowledged durable and ephemeral deliveries.
 * @param state Authoritative native router and publication ledgers.
 * @param triggerId Optional declared trigger identity restricting the count.
 * @returns The native completed count, preserving closed-owner errors.
 */
export function completedEventDeliveries(state: TestEventControlState, triggerId?: string): number {
  if (state.work.closed) throw new Error("Test event is closed");
  const id = triggerId === undefined ? undefined : normalizeId(triggerId);
  const durable = state
    .router()
    .snapshot()
    .deliveries.filter(
      (delivery) =>
        delivery.state === "completed" && (id === undefined || delivery.triggerId === id),
    ).length;
  return (
    durable +
    state
      .router()
      .snapshot()
      .triggers.filter((trigger) => id === undefined || trigger.id === id)
      .reduce((sum, trigger) => sum + (trigger.ephemeral?.completed ?? 0), 0)
  );
}
