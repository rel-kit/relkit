import { describe, expect, test } from "bun:test";
import {
  ADD_FAILURE_CODES,
  normalizeAddRequest,
  normalizeArtifactName,
} from "../../packages/create-relkit/src/index.ts";

describe("add option resolution", () => {
  test("normalizes friendly names and common defaults", () => {
    expect(normalizeArtifactName(" Send Receipt ")).toEqual({
      input: "Send Receipt",
      fileStem: "send-receipt",
      identifier: "sendReceipt",
      idSegment: "send-receipt",
    });
    expect(
      normalizeAddRequest(["function", "Send Receipt", "--service", "orders"], { cwd: "/tmp/app" }),
    ).toMatchObject({
      kind: "function",
      name: "Send Receipt",
      projectRoot: "/tmp/app",
      service: "orders",
      install: true,
      internal: false,
    });
  });

  test("resolves command defaults and repeatable values", () => {
    expect(normalizeAddRequest(["cache", "Sessions"], { cwd: "/tmp/app" })).toMatchObject({
      kind: "cache",
      name: "Sessions",
    });
    expect(
      normalizeAddRequest(
        ["service", "Billing", "--include", "function", "--include=event", "--no-install"],
        { cwd: "/tmp/app" },
      ),
    ).toMatchObject({ include: ["function", "event"], full: false, install: false });
    expect(
      normalizeAddRequest(
        ["route", "/users/:id", "--mode", "service-route", "--map", "GET=getUser"],
        { cwd: "/tmp/app" },
      ),
    ).toMatchObject({ mode: "service-route", maps: { GET: "getUser" } });
  });

  test("requires unambiguous headless agent and route choices", () => {
    for (const args of [
      ["agent", "Support", "--model", "openai:gpt-5-mini"],
      ["route", "/users"],
      ["service", "Orders", "--full", "--include", "function"],
      ["route", "/users", "--mode", "service-route", "--map", "ALL=list"],
      ["cache", "Sessions", "--profile", "shared", "--provider", "redis"],
    ]) {
      expect(() => normalizeAddRequest(args, { cwd: "/tmp/app" })).toThrow();
    }
    try {
      normalizeAddRequest(["job", "Send"], { cwd: "/tmp/app" });
    } catch (error) {
      expect(error).toMatchObject({ code: ADD_FAILURE_CODES.usage, exitCode: 2 });
    }
  });

  test("supports creating a tool function and rejects conflicting targets", () => {
    expect(
      normalizeAddRequest(["tool", "Lookup", "--create-function", "Find Order"]),
    ).toMatchObject({
      kind: "tool",
      target: "Find Order",
      createFunction: true,
    });
    for (const args of [
      ["tool", "Lookup"],
      ["tool", "Lookup", "--create-function", " "],
      ["tool", "Lookup", "--target", "findOrder", "--create-function", "Find Order"],
    ])
      expect(() => normalizeAddRequest(args)).toThrow();
  });

  test("derives a model selector when creating a profile", () => {
    expect(
      normalizeAddRequest(
        [
          "agent",
          "Support",
          "--model-provider",
          "anthropic",
          "--model-id",
          "claude-sonnet-4-5",
          "--instructions",
          "Be concise",
          "--tool",
          "lookup",
        ],
        { cwd: "/tmp/app" },
      ),
    ).toMatchObject({
      model: "anthropic:claude-sonnet-4-5",
      modelProvider: "anthropic",
      tools: ["lookup"],
      instructions: "Be concise",
    });
  });
});
