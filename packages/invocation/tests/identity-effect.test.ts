import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  DescriptorIdentityFailure,
  IdentityStore,
  bindDescriptorIdentity,
  bindDescriptorIdentityEffect,
  bindDescriptorServiceMembers,
  bindDescriptorServiceMembersEffect,
  createUnboundIdentityEffect,
  getDescriptorIdentityEffect,
  getDescriptorServiceIdentity,
  getDescriptorServiceIdentityEffect,
  isDescriptorIdentityBoundEffect,
  isUnboundIdentityEffect,
  isUnboundIdentity,
  resolveDescriptorIdentityEffect,
} from "../src/index.js";

function isolatedStore() {
  let counter = 0;
  return Layer.succeed(IdentityStore, {
    canonical: new WeakMap<object, string>(),
    unbound: new WeakMap<object, string>(),
    services: new WeakMap<object, object & { readonly id?: unknown }>(),
    nextUnboundId: () => String(++counter),
  });
}

describe("Effect descriptor identity", () => {
  test("uses an isolated Layer for canonical and unbound identities", () => {
    const layer = isolatedStore();
    const descriptor = {};
    expect(Effect.runSync(Effect.provide(createUnboundIdentityEffect(), layer))).toBe("unbound.1");
    expect(
      Effect.runSync(Effect.provide(resolveDescriptorIdentityEffect(descriptor), layer)),
    ).toMatchObject({ id: "unbound.2", canonical: false, key: descriptor });
    expect(Effect.runSync(Effect.provide(getDescriptorIdentityEffect(descriptor), layer))).toBe(
      "unbound.2",
    );
    expect(Effect.runSync(Effect.provide(isDescriptorIdentityBoundEffect(descriptor), layer))).toBe(
      false,
    );
    expect(
      Effect.runSync(
        Effect.provide(bindDescriptorIdentityEffect(descriptor, "orders.find"), layer),
      ),
    ).toBe(descriptor);
    expect(Effect.runSync(Effect.provide(isDescriptorIdentityBoundEffect(descriptor), layer))).toBe(
      true,
    );
    expect(Effect.runSync(isUnboundIdentityEffect("unbound.2"))).toBe(true);
    expect(isUnboundIdentity("unbound.2")).toBe(true);
  });

  test("tags conflicting bindings while preserving the public error", () => {
    const descriptor = {};
    bindDescriptorIdentity(descriptor, "orders.find");
    const failure = Effect.runSync(
      Effect.catchTag(
        bindDescriptorIdentityEffect(descriptor, "orders.create"),
        "DescriptorIdentityFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(DescriptorIdentityFailure);
    expect(failure.cause).toMatchObject({ code: "RELKIT_DESCRIPTOR_IDENTITY_CONFLICT" });
    expect(() => bindDescriptorIdentity(descriptor, "orders.create")).toThrow("already bound");
  });

  test("binds service members atomically and resolves their owner", () => {
    const service = { id: "orders.service" };
    const member = {};
    const layer = isolatedStore();
    expect(
      Effect.runSync(Effect.provide(bindDescriptorServiceMembersEffect([member], service), layer)),
    ).toEqual([member]);
    expect(Effect.runSync(Effect.provide(getDescriptorServiceIdentityEffect(member), layer))).toBe(
      "orders.service",
    );
    bindDescriptorServiceMembers([member], service);
    expect(getDescriptorServiceIdentity(member)).toBe("orders.service");
    expect(() => bindDescriptorServiceMembers([member], { id: "another.service" })).toThrow(
      "another service",
    );
  });
});
