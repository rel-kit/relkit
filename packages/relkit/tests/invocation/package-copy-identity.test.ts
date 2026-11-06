import { describe, expect, test, vi } from "vitest";
import * as primary from "../../src/invocation/index.js";

/** Loads a second, independent module instance, as when a bundled server and an
 * external integration each resolve their own copy of this package. */
async function loadSecondCopy(): Promise<typeof primary> {
  vi.resetModules();
  return import("../../src/invocation/index.js");
}

describe("failure identity across package copies", () => {
  test("loads genuinely distinct classes for the simulated copy", async () => {
    const copy = await loadSecondCopy();
    expect(copy.RuntimeFailure).not.toBe(primary.RuntimeFailure);
  });

  test("normalizes a declared failure created by another copy as an application failure", async () => {
    const copy = await loadSecondCopy();
    const foreign = copy.applicationFailure({
      id: "auth.unauthenticated",
      data: {},
      message: "Sign in to continue",
      retry: "never",
      status: 401,
      cause: undefined,
    });
    expect(foreign instanceof primary.RuntimeFailure).toBe(true);
    expect(primary.isInvocationFailure(foreign)).toBe(true);
    expect(primary.normalizeFailure(foreign)).toMatchObject({
      kind: "application",
      outcome: "declared-error",
      id: "auth.unauthenticated",
      status: 401,
    });
  });

  test("recognizes validation and recursion errors from another copy", async () => {
    const copy = await loadSecondCopy();
    const validation = new copy.InvocationValidationError("input", []);
    expect(validation instanceof primary.InvocationValidationError).toBe(true);
    expect(new copy.RecursionPolicyError("a", ["a"], ["a", "a"])).toBeInstanceOf(
      primary.RecursionPolicyError,
    );
  });

  test("reads private failure details recorded by another copy", async () => {
    const copy = await loadSecondCopy();
    const cause = new Error("no such table: user");
    const foreign = copy.unexpectedDefect(cause);
    expect(primary.readFailureDetail(foreign)?.cause).toBe(cause);
  });

  test("keeps unrelated values and subclasses distinct", () => {
    expect({ kind: "application" } instanceof primary.RuntimeFailure).toBe(false);
    expect(new TypeError("plain") instanceof primary.InvocationValidationError).toBe(false);
    expect(new Error("plain") instanceof primary.RecursionPolicyError).toBe(false);
  });
});

describe("descriptor identity across package copies", () => {
  test("resolves the same process-local identity and recognizes identity errors", async () => {
    const primaryResolve = await import("../../src/invocation/identity-resolve.js");
    const primaryState = await import("../../src/invocation/identity-state.js");
    vi.resetModules();
    const copyResolve = await import("../../src/invocation/identity-resolve.js");
    const copyState = await import("../../src/invocation/identity-state.js");
    expect(copyResolve.getDescriptorIdentity).not.toBe(primaryResolve.getDescriptorIdentity);
    const descriptor = {};
    expect(copyResolve.getDescriptorIdentity(descriptor)).toBe(
      primaryResolve.getDescriptorIdentity(descriptor),
    );
    expect(new copyState.DescriptorIdentityError("conflict")).toBeInstanceOf(
      primaryState.DescriptorIdentityError,
    );
  });
});
