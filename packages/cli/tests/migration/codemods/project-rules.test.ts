/**
 * Fixture tests for the rules that read other project files or the client contract: context
 * calls, dependency declarations, the Better Auth file, client hooks and agent runtimes.
 */
import { describe, expect, test } from "bun:test";
import { contextCallsRule } from "../../../src/migration/code-rules/context-calls.js";
import { dependencyDeclarationsRule } from "../../../src/migration/code-rules/dependency-declarations.js";
import { betterAuthFileRule } from "../../../src/migration/code-rules/better-auth-file.js";
import { clientHooksRule } from "../../../src/migration/code-rules/client-hooks.js";
import { agentRuntimeRule } from "../../../src/migration/code-rules/agent-runtime.js";
import { expectFixture, readFixture, testContext } from "./fixture.js";

const messages = (result: { findings: readonly { line: number; message: string }[] }) =>
  result.findings.map((finding) => [finding.line, finding.message]);

describe("dependency-declarations", () => {
  const sources = new Map([
    [
      "src/services/orders/events/order-created.event.ts",
      'const orderCreated = defineEvent({\n  id: "orders.created",\n  version: 1,\n});\nexport default orderCreated;\n',
    ],
  ]);

  test("declares published events and rewrites context access", () => {
    const result = expectFixture(
      dependencyDeclarationsRule,
      "publishes",
      "src/services/orders/functions/create-order.function.ts",
      testContext({ sources }),
    );
    expect(result.findings).toEqual([]);
  });

  test("reports event IDs it cannot find", () => {
    const result = expectFixture(
      dependencyDeclarationsRule,
      "unknown",
      "src/billing/charge.task.ts",
      testContext({ sources }),
    );
    expect(messages(result)).toEqual([
      [
        4,
        "Declare billing.charged under dependencies.events and publish through ctx.events.<name>.",
      ],
    ]);
  });
});

describe("context-calls", () => {
  const sources = new Map([
    ["src/services/orders/service.ts", "export default defineService({ functions: {} });\n"],
  ]);

  test("moves calls inside a handler onto ctx and declares them", () => {
    const result = expectFixture(
      contextCallsRule,
      "handler",
      "src/services/orders/functions/place-order.function.ts",
      testContext({ sources }),
    );
    expect(result.findings).toEqual([]);
  });

  test("uses getRelkit() outside handlers and reports channel triggers", () => {
    const result = expectFixture(
      contextCallsRule,
      "outside",
      "src/routes/middleware/auth.middleware.ts",
      testContext({ sources }),
    );
    expect(messages(result)).toEqual([
      [8, "Trigger updates from a handler's ctx.channels or through getRelkit().channels."],
    ]);
  });
});

describe("better-auth-file", () => {
  test("creates the Better Auth file and passes its instance", () => {
    const result = expectFixture(betterAuthFileRule, "service", "src/services/auth/service.ts");
    expect(result.findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining("Declare BETTER_AUTH_URL and BETTER_AUTH_SECRET"),
    ]);
    expect(result.created).toEqual([
      {
        path: "src/services/auth/better-auth.ts",
        text: readFixture("better-auth-file", "created.txt"),
      },
    ]);
  });

  test("reports options that read the service file's own declarations", () => {
    const result = expectFixture(betterAuthFileRule, "local", "src/services/auth/service.ts");
    expect(result.created).toBeUndefined();
    expect(result.findings[0]?.line).toBe(4);
  });

  test("reports an existing Better Auth file", () => {
    const text = readFixture("better-auth-file", "service.before.txt");
    const context = testContext({ sources: new Map([["src/services/auth/better-auth.ts", ""]]) });
    const result = betterAuthFileRule.apply(
      { path: "src/services/auth/service.ts", text },
      context,
    );
    expect(result.text).toBe(text);
    expect(result.findings[0]?.message).toContain("already exists");
  });
});

describe("client-hooks", () => {
  const clientRoutes = new Map([
    ["GET /orders", "orders.searchOrders"],
    ["route.post.announcements", "announcements.postAnnouncement"],
    ["GET /reports/:reportId", "orders.streamOrderReport"],
  ]);

  test("passes api properties and reports keys that are not routes", () => {
    const result = expectFixture(
      clientHooksRule,
      "hooks",
      "app/orders.tsx",
      testContext({ clientRoutes }),
    );
    expect(result.findings.map((finding) => finding.line)).toEqual([8]);
  });

  test("reports every key when no contract is available", () => {
    const text = readFixture("client-hooks", "hooks.before.txt");
    const result = clientHooksRule.apply({ path: "app/orders.tsx", text }, testContext());
    expect(result.text).toBe(text);
    expect(result.findings).toHaveLength(4);
  });
});

describe("agent-runtime", () => {
  test("moves native options into runtime: langchain()", () => {
    expect(
      expectFixture(agentRuntimeRule, "agent", "src/services/hello/agents/assistant.agent.ts")
        .findings,
    ).toEqual([]);
  });

  test("splits RelKit and LangChain tools on a single line", () => {
    expect(expectFixture(agentRuntimeRule, "profile", "src/a.agent.ts").findings).toEqual([]);
  });

  test("reports a tools array it cannot split", () => {
    expect(
      expectFixture(agentRuntimeRule, "mixed", "src/a.agent.ts").findings.map((f) => f.line),
    ).toEqual([4]);
  });
});
