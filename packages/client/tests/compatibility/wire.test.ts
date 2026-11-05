import { expect, test } from "bun:test";
import * as contracts from "relkit/contracts";
import { parseOperationId } from "relkit/realtime/operation-id";
import * as wire from "../../src/wire.ts";

test("the browser wire constants match relkit/contracts", () => {
  expect(wire.AGENT_CAPABILITY_HEADER).toBe(contracts.AGENT_CAPABILITY_HEADER);
  expect(wire.AGENT_CAPABILITY_QUERY).toBe(contracts.AGENT_CAPABILITY_QUERY);
  expect(wire.AGENT_CAPABILITY_VALUE).toBe(contracts.AGENT_CAPABILITY_VALUE);
  expect(wire.CLIENT_CONTRACT_EVENTS_PATH).toBe(contracts.CLIENT_CONTRACT_EVENTS_PATH);
  expect(wire.CLIENT_ROUTES_PATH).toBe(contracts.CLIENT_ROUTES_PATH);
  expect(wire.API_ROOT_KEY).toBe(contracts.CLIENT_API_ROOT);
});

test("canonicalJson matches relkit/contracts, including its rejections", () => {
  for (const value of [
    { b: [1, { d: null, c: "x" }], a: true },
    [],
    {},
    "text",
    0,
    Object.assign(Object.create(null), { z: 1, y: 2 }),
  ])
    expect(wire.canonicalJson(value)).toBe(contracts.canonicalJson(value));
  for (const value of [undefined, Number.NaN, () => 1, new Date(0), { a: undefined }, [, 1]]) {
    expect(() => contracts.canonicalJson(value)).toThrow();
    expect(() => wire.canonicalJson(value)).toThrow(TypeError);
  }
});

test("createOperationId makes UUIDv7 IDs that relkit accepts", () => {
  const now = Date.UTC(2026, 10, 5);
  const id = wire.createOperationId(now);
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(now);
  expect(() => parseOperationId(id, { now })).not.toThrow();
});
