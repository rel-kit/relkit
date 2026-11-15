import type { InspectorObject } from "./api-types";
import type { ActionAnswer } from "./action-answer";
import { parseJsonInput } from "./inspector-actions";
import type { ValidationIssue } from "./request-failure";
import { validateAgainstSchema } from "./schema-validate";

export type EventActionKind = "publish" | "replay" | "retry" | "cancel";

export interface Confirmation {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
}

/**
 * What the confirmation step says before an event action runs.
 * @param kind - The action.
 * @param target - The event id, publication id or delivery id the action is about.
 * @returns Title, one sentence saying what will happen, and the confirm button's label.
 */
export function confirmation(kind: EventActionKind, target: string): Confirmation {
  switch (kind) {
    case "publish":
      return {
        title: `Publish ${target}?`,
        description: "Publishes a new event; its reactions will run.",
        confirmLabel: "Publish event",
      };
    case "replay":
      return {
        title: `Replay publication ${target}?`,
        description:
          "Delivers this publication again to the functions that react to it, with its stored payload. Nothing new is published.",
        confirmLabel: "Replay",
      };
    case "retry":
      return {
        title: `Retry delivery ${target}?`,
        description: "Runs this delivery again from the start.",
        confirmLabel: "Retry",
      };
    case "cancel":
      return {
        title: `Cancel delivery ${target}?`,
        description: "Stops this delivery; it will not run unless it is retried.",
        confirmLabel: "Cancel delivery",
      };
  }
}

/** Why a provider answers 501 to each action. */
export function unsupportedText(kind: EventActionKind): string {
  switch (kind) {
    case "publish":
      return "The application has no schema for this event, so the Inspector cannot publish it.";
    case "replay":
      return "This provider keeps no payload for this publication, so it cannot be delivered again.";
    case "retry":
      return "This provider cannot retry a delivery.";
    case "cancel":
      return "This provider cannot cancel a delivery.";
  }
}

/**
 * Reads what an applied event action did.
 * @param kind - The action.
 * @param target - The event, publication or delivery id the action was run on.
 * @param receipt - The action's JSON receipt.
 * @returns One sentence, and the new publication's id when the action published one.
 */
export function eventActionSuccess(
  kind: EventActionKind,
  target: string,
  receipt: InspectorObject,
): { readonly text: string; readonly publicationId?: string } {
  const result =
    receipt.result !== null && typeof receipt.result === "object"
      ? (receipt.result as InspectorObject)
      : {};
  const named = result.instanceId ?? result.publicationId;
  const id = typeof named === "string" ? named : undefined;
  const version = typeof result.version === "number" ? ` v${result.version}` : "";
  const created = id === undefined ? {} : { publicationId: id };
  switch (kind) {
    case "publish":
      return {
        text:
          id === undefined
            ? `Published ${target}.`
            : `Published ${target}${version} as publication ${id}.`,
        ...created,
      };
    case "replay":
      // A replay delivers the same publication again; the receipt repeats its id.
      return {
        text: `Delivered publication ${target} again to its reactions. Nothing new was published.`,
      };
    case "retry":
      return { text: `Retried delivery ${target}.` };
    case "cancel":
      return { text: `Cancelled delivery ${target}.` };
  }
}

/**
 * Parses the payload text and checks it against the event's declared schema.
 * @param text - What the developer typed.
 * @param schema - The event's input schema node.
 * @returns The value to send, or the answer to show instead of sending.
 */
export function checkPayload(
  text: string,
  schema: unknown,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly answer: ActionAnswer } {
  const parsed = parseJsonInput(text);
  if (!parsed.ok)
    return {
      ok: false,
      answer: {
        text: "The payload is not valid JSON. Nothing was sent.",
        noSession: false,
        sent: false,
      },
    };
  const issues = validateAgainstSchema(schema, parsed.value);
  return issues.length === 0
    ? { ok: true, value: parsed.value }
    : { ok: false, answer: payloadAnswer(issues) };
}

/** The answer shown when the payload fails the event's schema in the page, so nothing is sent. */
export function payloadAnswer(issues: readonly ValidationIssue[]): ActionAnswer {
  return {
    text: "The payload does not satisfy the event's schema. Nothing was sent.",
    issues,
    noSession: false,
    sent: false,
  };
}
