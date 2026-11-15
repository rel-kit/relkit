import { expect, test } from "bun:test";
import { ACTION_SESSION_NOTE, routeSessionNote } from "./session-note";

test("a route request without an Authorization value says it had no user session (D11)", () => {
  expect(routeSessionNote(new Headers({ accept: "application/json" }))).toBe(
    "This request was sent without a user session.",
  );
  expect(routeSessionNote(undefined)).toBe("This request was sent without a user session.");
});

test("a supplied Authorization value is named, never repeated", () => {
  const note = routeSessionNote(new Headers({ authorization: "Bearer secret-token" }));
  expect(note).toBe("This request was sent with the Authorization value you supplied.");
  expect(note).not.toContain("secret-token");
});

test("an action says it ran without a user session", () => {
  expect(ACTION_SESSION_NOTE).toBe("The Inspector ran this action without a user session.");
});
