import { describe, expect, test } from "bun:test";
import {
  applicationLabel,
  applicationNotice,
  liveUpdates,
  needsApplicationNotice,
} from "./stream-application-text";
import { INITIAL_INSPECTOR_STATE, type InspectorState } from "./stream-application";

const time = () => "10:00:00.000 UTC";

function state(
  patch: Partial<InspectorState["application"]>,
  stream: InspectorState["stream"] = "connected",
) {
  return {
    ...INITIAL_INSPECTOR_STATE,
    stream,
    application: { ...INITIAL_INSPECTOR_STATE.application, ...patch },
  } satisfies InspectorState;
}

describe("application notice", () => {
  test("says nothing while connected or still checking", () => {
    expect(applicationNotice(state({ state: "connected" }), time)).toBeUndefined();
    expect(applicationNotice(state({ state: "checking" }), time)).toBeUndefined();
  });

  test("an unreachable session says since when, that history stays, and what to do", () => {
    const notice = applicationNotice(
      state({ state: "unreachable", sessionId: "dev-1", since: "2026-11-15T10:00:00Z" }),
      time,
    )!;
    expect(notice.title).toBe("The application is not connected");
    expect(notice.body).toBe(
      "The `relkit dev` session `dev-1` stopped answering at 10:00:00.000 UTC. Retained history is still shown; live updates are paused.",
    );
    expect(notice.next).toContain("`inspector: { enabled: true }`");
  });

  test("with no session at all it waits for one (IN-48)", () => {
    const notice = applicationNotice(
      state({ state: "waiting", since: "2026-11-15T10:00:00Z" }),
      time,
    )!;
    expect(notice.title).toBe("Waiting for a development session");
    expect(notice.body).toContain("No running `relkit dev` session was found for this project");
    expect(notice.next).toContain("Start `relkit dev`");
  });

  test("several sessions name them and the flag that picks one", () => {
    const notice = applicationNotice(state({ state: "ambiguous", sessions: ["a", "b"] }), time)!;
    expect(notice.title).toBe("Several development sessions found");
    expect(notice.body).toContain("2 `relkit dev` sessions");
    expect(notice.body).toContain("`a`, `b`");
    expect(notice.next).toContain("`--connection-file`");
  });

  test("a lost stream to the Inspector is its own notice", () => {
    const notice = applicationNotice(state({ state: "connected" }, "reconnecting"), time)!;
    expect(notice.title).toBe("The Inspector is not answering");
  });
});

describe("labels", () => {
  test("name each application state plainly", () => {
    expect(applicationLabel("waiting")).toBe("no session");
    expect(applicationLabel("unreachable")).toBe("unreachable");
    expect(applicationLabel("ambiguous")).toBe("several sessions");
  });

  test("live updates pause while the application is away", () => {
    expect(liveUpdates("connected", "connected")).toBe("connected");
    expect(liveUpdates("connected", "checking")).toBe("connected");
    expect(liveUpdates("connected", "unreachable")).toBe("paused");
    expect(liveUpdates("reconnecting", "unreachable")).toBe("reconnecting");
  });

  test("a page that needs the application says so only when it is away", () => {
    expect(needsApplicationNotice("connected")).toBeUndefined();
    expect(needsApplicationNotice("checking")).toBeUndefined();
    expect(needsApplicationNotice("waiting")?.title).toBe(
      "Unavailable while the application is not connected",
    );
  });
});
