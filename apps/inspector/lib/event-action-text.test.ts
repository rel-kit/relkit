import { describe, expect, test } from "bun:test";
import {
  checkPayload,
  confirmation,
  eventActionSuccess,
  payloadAnswer,
  unsupportedText,
} from "./event-action-text";

describe("what an event action says before it runs", () => {
  test("publish and replay say what will happen", () => {
    expect(confirmation("publish", "orders.created").description).toBe(
      "Publishes a new event; its reactions will run.",
    );
    expect(confirmation("replay", "pub-1").description).toBe(
      "Publishes this event's payload again as a new event.",
    );
    expect(confirmation("retry", "d-1").description).toBe(
      "Runs this delivery again from the start.",
    );
    expect(confirmation("cancel", "d-1").description).toBe(
      "Stops this delivery; it will not run unless it is retried.",
    );
  });

  test("the title and the button name the action", () => {
    expect(confirmation("publish", "orders.created")).toMatchObject({
      title: "Publish orders.created?",
      confirmLabel: "Publish event",
    });
    expect(confirmation("replay", "pub-1")).toMatchObject({
      title: "Replay publication pub-1?",
      confirmLabel: "Replay",
    });
  });
});

describe("what an event action says afterwards", () => {
  test("a publish names the new publication", () => {
    expect(
      eventActionSuccess("publish", "orders.created", {
        result: { eventId: "orders.created", version: 1, instanceId: "pub-9" },
      }),
    ).toEqual({
      text: "Published orders.created v1 as publication pub-9.",
      publicationId: "pub-9",
    });
  });

  test("a replay names the publication it was replayed from and the new one", () => {
    expect(
      eventActionSuccess("replay", "pub-1", {
        result: { replayOf: "pub-1", eventId: "orders.created", version: 1, instanceId: "pub-10" },
      }),
    ).toEqual({
      text: "Published the payload of pub-1 again as publication pub-10.",
      publicationId: "pub-10",
    });
  });

  test("retry and cancel name the delivery", () => {
    expect(eventActionSuccess("retry", "d-1", {}).text).toBe("Retried delivery d-1.");
    expect(eventActionSuccess("cancel", "d-1", {}).text).toBe("Cancelled delivery d-1.");
  });

  test("a receipt without a publication id still reports success", () => {
    expect(eventActionSuccess("publish", "orders.created", {}).text).toBe(
      "Published orders.created.",
    );
  });
});

describe("what a refusal by the provider says", () => {
  test("each action names what the provider cannot do", () => {
    expect(unsupportedText("retry")).toBe("This provider cannot retry a delivery.");
    expect(unsupportedText("cancel")).toBe("This provider cannot cancel a delivery.");
    expect(unsupportedText("replay")).toBe(
      "This provider keeps no payload for this publication, so it cannot be published again.",
    );
    expect(unsupportedText("publish")).toBe(
      "The application has no schema for this event, so the Inspector cannot publish it.",
    );
  });
});

describe("checking the payload text before publishing", () => {
  const schema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };

  test("passes a valid payload on as a value", () => {
    expect(checkPayload('{"id":"a"}', schema)).toEqual({ ok: true, value: { id: "a" } });
  });

  test("stops text that is not JSON", () => {
    const checked = checkPayload("{", schema);
    expect(checked.ok).toBe(false);
    if (!checked.ok)
      expect(checked.answer.text).toBe("The payload is not valid JSON. Nothing was sent.");
  });

  test("stops a payload that fails the schema and names the field", () => {
    const checked = checkPayload("{}", schema);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.answer.issues).toEqual([{ path: "id", code: "missing" }]);
  });

  test("sends an event without a readable schema as written", () => {
    expect(checkPayload('{"x":1}', undefined)).toEqual({ ok: true, value: { x: 1 } });
  });
});

describe("a payload that fails the schema in the page", () => {
  test("says nothing was sent and lists the fields", () => {
    expect(payloadAnswer([{ path: "orderId", code: "missing" }])).toEqual({
      text: "The payload does not satisfy the event's schema. Nothing was sent.",
      issues: [{ path: "orderId", code: "missing" }],
      noSession: false,
    });
  });
});
