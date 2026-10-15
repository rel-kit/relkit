import { afterEach, describe, expect, test } from "bun:test";
import {
  connectLandingMotion,
  type LandingMotionState,
} from "../components/landing/motion-controller";
import { topologyFixture } from "./topology-fixture";

describe("landing CSS motion lifecycle", () => {
  let fixture: ReturnType<typeof topologyFixture>;
  afterEach(() => fixture?.restore());

  test("suspends offscreen, in hidden tabs, and for reduced motion", () => {
    fixture = topologyFixture();
    let state: LandingMotionState;
    const controller = connectLandingMotion(fixture.host, "test-motion", (next) => {
      state = next;
    });
    expect(state!.running).toBe(false);
    fixture.visible(true);
    expect(state!.running).toBe(true);
    fixture.hidden(true);
    expect(state!.running).toBe(false);
    fixture.hidden(false);
    expect(state!.running).toBe(true);
    fixture.reduced(true);
    expect(state!.reduced).toBe(true);
    expect(state!.running).toBe(false);
    fixture.reduced(false);
    fixture.visible(false);
    expect(state!.running).toBe(false);
    controller.dispose();
  });

  test("keeps the pause choice across remounts and cleans up listeners", () => {
    fixture = topologyFixture();
    const storage = new Map<string, string>();
    Object.assign(window, {
      sessionStorage: {
        getItem: (key: string) => storage.get(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    const states: LandingMotionState[] = [];
    const connect = () =>
      connectLandingMotion(fixture.host, "test-motion", (next) => states.push(next));
    const first = connect();
    fixture.visible(true);
    first.toggle();
    expect(states.at(-1)?.paused).toBe(true);
    fixture.hidden(true);
    fixture.hidden(false);
    expect(states.at(-1)?.running).toBe(false);
    first.dispose();
    const calls = states.length;
    fixture.visible(true);
    fixture.hidden(true);
    fixture.reduced(true);
    expect(states.length).toBe(calls);
    const second = connect();
    expect(states.at(-1)?.paused).toBe(true);
    fixture.hidden(false);
    fixture.reduced(false);
    fixture.visible(true);
    expect(states.at(-1)?.running).toBe(false);
    second.toggle();
    expect(states.at(-1)?.running).toBe(true);
    second.dispose();
    expect(fixture.disconnected()[0]).toBe(2);
  });

  test("works when storage access is blocked", () => {
    fixture = topologyFixture();
    let state: LandingMotionState;
    const controller = connectLandingMotion(fixture.host, "test-motion", (next) => {
      state = next;
    });
    fixture.visible(true);
    controller.toggle();
    expect(state!.paused).toBe(true);
    expect(state!.running).toBe(false);
    controller.toggle();
    expect(state!.running).toBe(true);
    controller.dispose();
  });
});
