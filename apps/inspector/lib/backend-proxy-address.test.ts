import { expect, test } from "bun:test";
import { inspectorAddressFromEnv, isOwnInspectorHost } from "./backend-proxy-address";

const own = inspectorAddressFromEnv({ HOSTNAME: "127.0.0.1", PORT: "3210" });

test("the Inspector's own loopback spellings and port are accepted", () => {
  for (const host of ["127.0.0.1:3210", "localhost:3210", "LOCALHOST:3210", "[::1]:3210"])
    expect(isOwnInspectorHost(host, own)).toBe(true);
});

test("another name, another port or a malformed host is refused", () => {
  for (const host of [
    "rebind.attacker.example:3210",
    "rebind.attacker.example",
    "127.0.0.1:3211",
    "127.0.0.1",
    "evil@127.0.0.1:3210",
    "127.0.0.1:3210/path",
    "localhost.attacker.example:3210",
    "",
  ])
    expect(isOwnInspectorHost(host, own)).toBe(false);
});

test("the configured host is accepted next to the loopback names", () => {
  const named = inspectorAddressFromEnv({ HOSTNAME: "Dev-Box.local", PORT: "3210" });
  expect(isOwnInspectorHost("dev-box.local:3210", named)).toBe(true);
  expect(isOwnInspectorHost("127.0.0.1:3210", named)).toBe(true);
  expect(isOwnInspectorHost("other.local:3210", named)).toBe(false);
  const v6 = inspectorAddressFromEnv({ HOSTNAME: "::1", PORT: "3210" });
  expect(isOwnInspectorHost("[::1]:3210", v6)).toBe(true);
});

test("on every interface address literals and a published port are accepted, names are not", () => {
  const all = inspectorAddressFromEnv({ HOSTNAME: "0.0.0.0", PORT: "3210" });
  expect(isOwnInspectorHost("127.0.0.1:49152", all)).toBe(true);
  expect(isOwnInspectorHost("192.168.1.20:3210", all)).toBe(true);
  expect(isOwnInspectorHost("localhost:49152", all)).toBe(true);
  expect(isOwnInspectorHost("rebind.attacker.example:3210", all)).toBe(false);
});

test("without a port from the tool only loopback names are accepted, on any port", () => {
  const unknown = inspectorAddressFromEnv({});
  expect(isOwnInspectorHost("localhost:3000", unknown)).toBe(true);
  expect(isOwnInspectorHost("rebind.attacker.example:3000", unknown)).toBe(false);
  expect(isOwnInspectorHost("192.168.1.20:3000", unknown)).toBe(false);
});
