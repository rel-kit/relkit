import { expect, it } from "vitest";
import { isValidElement } from "react";
import { BetterAuthRelkitClientProvider } from "../src/react.js";

it("uses stable keys and gates pending identity across native session transitions", () => {
  const render = (
    data: unknown,
    isPending = false,
    identityKey: string | null | undefined = "ready",
  ) => {
    const value = BetterAuthRelkitClientProvider({
      authClient: { useSession: () => ({ data, isPending }) },
      children: null,
      ...(identityKey === undefined ? {} : { identityKey }),
    });
    if (!isValidElement<{ identityKey?: string | null }>(value))
      throw new Error("Expected React provider element");
    return value;
  };
  const pending = render(null, true);
  const anonymous = render(null);
  const session = { session: { id: "session-1", updatedAt: "first" }, user: { id: "user-1" } };
  const authenticated = render(session);
  expect(pending.key).toBe("pending");
  expect(pending.props.identityKey).toBe(null);
  expect(anonymous.key).toBe("anonymous");
  expect(render(undefined).key).toBe(anonymous.key);
  expect(authenticated.key).toBe("session-1:first:user-1");
  expect(authenticated.props.identityKey).toBe("ready");
  expect(render({ ...session }).key).toBe(authenticated.key);
  expect(render({ ...session, session: { ...session.session, updatedAt: "second" } }).key).not.toBe(
    authenticated.key,
  );
  expect(render({ ...session, user: { id: "user-2" } }).key).not.toBe(authenticated.key);
  expect(render(session, false, null).props.identityKey).toBe(null);
  const implicitIdentity = BetterAuthRelkitClientProvider({
    authClient: { useSession: () => ({ data: session, isPending: false }) },
    children: null,
  });
  if (!isValidElement<{ identityKey?: string | null }>(implicitIdentity))
    throw new Error("Expected provider element");
  expect(implicitIdentity.props.identityKey).toBeUndefined();
});

it("calls the native hook once and keeps authentication errors owned by it", () => {
  let calls = 0;
  const element = BetterAuthRelkitClientProvider({
    authClient: {
      useSession() {
        calls++;
        return { data: null, isPending: false, error: new Error("native auth error") };
      },
    },
    children: null,
  });
  expect(isValidElement(element)).toBe(true);
  expect(calls).toBe(1);
});
