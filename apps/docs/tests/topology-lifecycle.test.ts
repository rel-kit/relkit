import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
  connectTopology,
  type TopologyScene,
  type TopologyStatus,
} from "../components/landing/topology-controller";
import { topologyFixture } from "./topology-fixture";

let browser: ReturnType<typeof topologyFixture>;
let connection: ReturnType<typeof connectTopology> | undefined;
beforeEach(() => {
  browser = topologyFixture();
});
afterEach(() => {
  connection?.dispose();
  connection = undefined;
  browser.restore();
});

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
const sceneFixture = () => ({
  render: mock((_elapsed: number) => {}),
  resize: mock(() => {}),
  dispose: mock(() => {}),
});

test("defers imports until visible in a foreground tab and imports only once", async () => {
  const scene = sceneFixture();
  const load = mock(async () => scene);
  connection = connectTopology(browser.host, { load, paused: false, onStatus: () => {} });
  expect(load).not.toHaveBeenCalled();
  browser.hidden(true);
  browser.visible(true);
  expect(load).not.toHaveBeenCalled();
  browser.hidden(false);
  await settle();
  expect(load).toHaveBeenCalledTimes(1);
  expect(scene.render).toHaveBeenCalledTimes(1);
  expect(browser.frames.size).toBe(1);
  browser.visible(false);
  expect(browser.frames.size).toBe(0);
  browser.visible(true);
  expect(load).toHaveBeenCalledTimes(1);
  expect(browser.frames.size).toBe(1);
});

test("caps rendering at 24fps and freezes time through pause and hidden tabs", async () => {
  const scene = sceneFixture();
  connection = connectTopology(browser.host, {
    load: async () => scene,
    paused: false,
    onStatus: () => {},
  });
  browser.visible(true);
  await settle();
  for (const time of [0, 16, 32, 42, 58, 74, 84]) browser.frame(time);
  expect(scene.render.mock.calls.map(([elapsed]) => elapsed)).toEqual([0, 42, 84]);
  connection.setPaused(true);
  expect(browser.frames.size).toBe(0);
  browser.visible(false);
  browser.visible(true);
  expect(browser.frames.size).toBe(0);
  connection.setPaused(false);
  browser.frame(10_000);
  browser.frame(10_042);
  expect(scene.render).toHaveBeenLastCalledWith(126);
  browser.hidden(true);
  expect(browser.frames.size).toBe(0);
  browser.hidden(false);
  browser.frame(30_000);
  browser.frame(30_042);
  expect(scene.render).toHaveBeenLastCalledWith(168);
});

test("reduced motion never loads WebGL and changes suspend an existing scene", async () => {
  browser.reduced(true);
  const scene = sceneFixture();
  const load = mock(async () => scene);
  const statuses: TopologyStatus[] = [];
  connection = connectTopology(browser.host, {
    load,
    paused: false,
    onStatus: (status) => statuses.push(status),
  });
  browser.visible(true);
  await settle();
  expect(load).not.toHaveBeenCalled();
  expect(statuses.at(-1)).toBe("reduced");
  browser.reduced(false);
  await settle();
  expect(statuses.at(-1)).toBe("ready");
  expect(browser.frames.size).toBe(1);
  browser.reduced(true);
  expect(browser.frames.size).toBe(0);
  expect(statuses.at(-1)).toBe("reduced");
});

test("disposes a late import after unmount without drawing or scheduling frames", async () => {
  let resolveScene!: (scene: TopologyScene) => void;
  const scene = sceneFixture();
  connection = connectTopology(browser.host, {
    load: () =>
      new Promise((resolve) => {
        resolveScene = resolve;
      }),
    paused: false,
    onStatus: () => {},
  });
  browser.visible(true);
  connection.dispose();
  connection = undefined;
  resolveScene(scene);
  await settle();
  expect(scene.dispose).toHaveBeenCalledTimes(1);
  expect(scene.render).not.toHaveBeenCalled();
  expect(browser.frames.size).toBe(0);
  expect(browser.disconnected()).toEqual([1, 1]);
});

test("context loss returns to the fallback and does not retry or restart", async () => {
  const scene = sceneFixture();
  const load = mock(async () => scene);
  const statuses: TopologyStatus[] = [];
  connection = connectTopology(browser.host, {
    load,
    paused: false,
    onStatus: (status) => statuses.push(status),
  });
  browser.visible(true);
  await settle();
  browser.host.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  expect(statuses.at(-1)).toBe("unavailable");
  expect(scene.dispose).toHaveBeenCalledTimes(1);
  expect(browser.frames.size).toBe(0);
  browser.visible(false);
  browser.visible(true);
  connection.setPaused(false);
  expect(load).toHaveBeenCalledTimes(1);
  expect(browser.frames.size).toBe(0);
});

test("render failures cancel even the currently executing frame", async () => {
  const scene = sceneFixture();
  connection = connectTopology(browser.host, {
    load: async () => scene,
    paused: false,
    onStatus: () => {},
  });
  browser.visible(true);
  await settle();
  scene.render.mockImplementation(() => {
    throw new Error("GPU unavailable");
  });
  browser.frame(0);
  browser.frame(42);
  expect(browser.frames.size).toBe(0);
  expect(scene.dispose).toHaveBeenCalledTimes(1);
});

test("import failures remain static; cleanup removes event listeners and frames", async () => {
  const statuses: TopologyStatus[] = [];
  const load = mock(async () => {
    throw new Error("Import unavailable");
  });
  connection = connectTopology(browser.host, {
    load,
    paused: false,
    onStatus: (status) => statuses.push(status),
  });
  browser.visible(true);
  await settle();
  expect(statuses.at(-1)).toBe("unavailable");
  browser.hidden(true);
  browser.hidden(false);
  expect(load).toHaveBeenCalledTimes(1);
  connection.dispose();
  connection = undefined;
  const count = statuses.length;
  browser.reduced(true);
  browser.hidden(true);
  expect(statuses.length).toBe(count);
  expect(browser.disconnected()).toEqual([1, 1]);
});
