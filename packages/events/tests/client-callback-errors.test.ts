import { expect, test } from "vitest";
import { parsePayload } from "../src/client-validation.js";
import { createEventClient } from "../src/client.js";
import { resolveProvider, resolveValue } from "../src/client-provider.js";

test("preserves original validator, resolver, and client callback failures", async () => {
  const validatorFailure = new Error("validator offline");
  const schema = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => Promise.reject(validatorFailure),
    },
  };
  await expect(parsePayload(schema as never, {})).rejects.toBe(validatorFailure);
  const provider = { publish: async () => ({ accepted: true as const }) };
  const base = {
    ownerId: "orders.create",
    eventId: "orders.created",
    version: 1 as const,
    source: provider,
  };
  const client = createEventClient({ ...base, payloadSchema: schema as never });
  await expect(client.publish({})).rejects.toBe(validatorFailure);

  const resolverFailure = new Error("resolver offline");
  const resolver = () => {
    throw resolverFailure;
  };
  expect(() => resolveProvider({}, "default", resolver)).toThrow(resolverFailure);
  expect(() => createEventClient({ ...base, resolveProfile: resolver })).toThrow(resolverFailure);

  const signalFailure = new Error("signal offline");
  const signalClient = createEventClient({
    ...base,
    signal: () => {
      throw signalFailure;
    },
  });
  await expect(signalClient.publish({})).rejects.toBe(signalFailure);
  const correlationFailure = new Error("correlation offline");
  expect(() =>
    resolveValue(() => {
      throw correlationFailure;
    }),
  ).toThrow(correlationFailure);
});
